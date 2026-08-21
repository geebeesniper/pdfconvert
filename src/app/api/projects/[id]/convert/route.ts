import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { parseCoaPdf } from "@/lib/coa-parser";
import { resolveTemplate } from "@/lib/coa-normalizer";
import { generateExcel } from "@/lib/excel-generator";
import { getProject } from "@/lib/repository";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  MAX_PDF_BYTES,
  assertPdfBytes,
  isUuid,
  safeClientError,
  safeStorageSourcePath,
  validatePdfFileName,
} from "@/lib/upload-security";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

function safeBase(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "coa";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("PDF processing timed out.")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });

  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let sourcePath = "";
  let sourceFileName = "";
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    sourcePath = safeStorageSourcePath(id, body.sourcePath);
    sourceFileName = validatePdfFileName(body.sourceFileName);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Refuse duplicate conversion requests for the exact same uploaded object.
  const { data: existing } = await db
    .from("conversions")
    .select("id,status")
    .eq("project_id", id)
    .eq("source_storage_path", sourcePath)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "This PDF has already been submitted for conversion." }, { status: 409 });
  }

  // Verify the object exists and is still within the hard size limit before
  // loading it into the Vercel function's memory.
  const slash = sourcePath.lastIndexOf("/");
  const folder = sourcePath.slice(0, slash);
  const objectName = sourcePath.slice(slash + 1);
  const { data: listed, error: listError } = await db.storage
    .from("coa-sources")
    .list(folder, { limit: 20, search: objectName });
  if (listError) return NextResponse.json({ error: "Uploaded PDF could not be verified." }, { status: 500 });

  const objectInfo = listed?.find((item) => item.name === objectName);
  if (!objectInfo) return NextResponse.json({ error: "Uploaded PDF was not found." }, { status: 404 });

  const metadata = (objectInfo.metadata || {}) as { size?: number; mimetype?: string };
  if (typeof metadata.size === "number" && metadata.size > MAX_PDF_BYTES) {
    await db.storage.from("coa-sources").remove([sourcePath]);
    return NextResponse.json({ error: "PDF is too large and was rejected." }, { status: 413 });
  }
  if (metadata.mimetype && metadata.mimetype !== "application/pdf") {
    await db.storage.from("coa-sources").remove([sourcePath]);
    return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 415 });
  }

  const { data: row, error: insertError } = await db
    .from("conversions")
    .insert({
      project_id: id,
      source_file_name: sourceFileName,
      source_storage_path: sourcePath,
      status: "processing",
    })
    .select("*")
    .single();

  if (insertError || !row) {
    return NextResponse.json({ error: "Could not start conversion." }, { status: 500 });
  }

  try {
    const { data: pdfBlob, error: downloadError } = await db.storage.from("coa-sources").download(sourcePath);
    if (downloadError || !pdfBlob) throw new Error("PDF could not be downloaded.");
    if (pdfBlob.size > MAX_PDF_BYTES) throw new Error("PDF is too large and was rejected.");

    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
    assertPdfBytes(pdfBytes);

    const parsed = await withTimeout(parseCoaPdf(pdfBytes), 25_000);
    if (!parsed.items.length) {
      throw new Error("No analysis table rows were detected. This PDF may be scanned and needs OCR.");
    }

    const type = resolveTemplate(parsed, project.default_template);
    const generated = await withTimeout(generateExcel(parsed, project, type), 10_000);
    if (generated.buffer.byteLength > MAX_OUTPUT_BYTES) throw new Error("Generated Excel file exceeded the safe output limit.");

    const outputName = `${safeBase(sourceFileName)}-${type}-${randomUUID().slice(0, 8)}.xlsx`;
    const outputPath = `${id}/${new Date().toISOString().slice(0, 10)}/${outputName}`;
    const { error: uploadError } = await db.storage.from("coa-outputs").upload(outputPath, generated.buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
    if (uploadError) throw new Error("Excel output could not be stored.");

    const { data: updated, error: updateError } = await db
      .from("conversions")
      .update({
        status: "ready",
        output_file_name: outputName,
        output_storage_path: outputPath,
        template_type: type,
        product_name: generated.outputProduct,
        batch_number: generated.outputBatch,
        manufacturing_date: parsed.manufacturingDate || null,
        extracted_data: parsed,
        warning_count: parsed.warnings.length,
      })
      .eq("id", row.id)
      .select("*")
      .single();

    if (updateError) throw new Error("Conversion history could not be updated.");
    return NextResponse.json({ conversion: updated });
  } catch (error) {
    const message = safeClientError(error);
    await db.from("conversions").update({ status: "error", error_message: message }).eq("id", row.id);
    return NextResponse.json({ error: message, conversionId: row.id }, { status: 422 });
  }
}

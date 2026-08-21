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

type ProgressEvent = {
  type: "stage" | "done" | "error";
  stage?: string;
  detail?: string;
  progress?: number;
  conversionId?: string;
  error?: string;
};

function safeBase(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "coa";
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid workspace." }, { status: 400 });

  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

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

  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ProgressEvent) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          streamClosed = true;
        }
      };

      const close = () => {
        if (streamClosed) return;
        streamClosed = true;
        try { controller.close(); } catch { /* client disconnected */ }
      };

      void (async () => {
        const db = getSupabaseAdmin();
        let conversionId: string | null = null;

        try {
          send({ type: "stage", stage: "Verifying upload", detail: "Checking file metadata and duplicate submissions…", progress: 34 });

          const { data: existing, error: existingError } = await db
            .from("conversions")
            .select("id,status")
            .eq("project_id", id)
            .eq("source_storage_path", sourcePath)
            .limit(1)
            .maybeSingle();
          if (existingError) throw new Error("Conversion history could not be checked.");
          if (existing) throw new Error("This PDF has already been submitted for conversion.");

          const slash = sourcePath.lastIndexOf("/");
          const folder = sourcePath.slice(0, slash);
          const objectName = sourcePath.slice(slash + 1);
          const { data: listed, error: listError } = await db.storage.from("coa-sources").list(folder, { limit: 20, search: objectName });
          if (listError) throw new Error("Uploaded PDF could not be verified.");

          const objectInfo = listed?.find((item: { name: string }) => item.name === objectName);
          if (!objectInfo) throw new Error("Uploaded PDF was not found.");

          const metadata = (objectInfo.metadata || {}) as { size?: number; mimetype?: string };
          if (typeof metadata.size === "number" && metadata.size > MAX_PDF_BYTES) {
            await db.storage.from("coa-sources").remove([sourcePath]);
            throw new Error("PDF is too large and was rejected.");
          }
          if (metadata.mimetype && metadata.mimetype !== "application/pdf") {
            await db.storage.from("coa-sources").remove([sourcePath]);
            throw new Error("Only PDF files are accepted.");
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
          if (insertError || !row) throw new Error("Could not start conversion.");
          conversionId = row.id as string;

          send({ type: "stage", stage: "Reading PDF", detail: "Loading the uploaded COA into the parser…", progress: 42, conversionId });
          const { data: pdfBlob, error: downloadError } = await withTimeout(
            db.storage.from("coa-sources").download(sourcePath),
            8_000,
            "PDF download timed out.",
          );
          if (downloadError || !pdfBlob) throw new Error("PDF could not be downloaded.");
          if (pdfBlob.size > MAX_PDF_BYTES) throw new Error("PDF is too large and was rejected.");

          const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
          assertPdfBytes(pdfBytes);

          send({ type: "stage", stage: "Parsing COA", detail: "Extracting product, batch, dates and analysis rows…", progress: 52, conversionId });
          const parsed = await withTimeout(parseCoaPdf(pdfBytes), 25_000, "PDF processing timed out.");
          if (!parsed.items.length) throw new Error("No analysis table rows were detected. This PDF may be scanned and needs OCR.");

          send({ type: "stage", stage: "Mapping fields", detail: `Detected ${parsed.items.length} analysis rows. Normalizing the COA structure…`, progress: 68, conversionId });
          const type = resolveTemplate(parsed, project.default_template);

          send({ type: "stage", stage: "Building Excel", detail: `Using the ${type} template and preserving workbook formatting…`, progress: 80, conversionId });
          const generated = await withTimeout(generateExcel(parsed, project, type), 10_000, "Excel generation timed out.");
          if (generated.buffer.byteLength > MAX_OUTPUT_BYTES) throw new Error("Generated Excel file exceeded the safe output limit.");

          send({ type: "stage", stage: "Saving output", detail: "Uploading the generated Excel file and updating History…", progress: 92, conversionId });
          const outputName = `${safeBase(sourceFileName)}-${type}-${randomUUID().slice(0, 8)}.xlsx`;
          const outputPath = `${id}/${new Date().toISOString().slice(0, 10)}/${outputName}`;
          const { error: uploadError } = await withTimeout(
            db.storage.from("coa-outputs").upload(outputPath, generated.buffer, {
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              upsert: false,
            }),
            8_000,
            "Excel upload timed out.",
          );
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
              error_message: null,
            })
            .eq("id", conversionId)
            .select("id")
            .single();
          if (updateError || !updated) throw new Error("Conversion history could not be updated.");

          send({ type: "done", stage: "Excel ready", detail: "Conversion complete. The file is now available in History.", progress: 100, conversionId });
        } catch (error) {
          const message = safeClientError(error);
          if (conversionId) {
            await db.from("conversions").update({ status: "error", error_message: message }).eq("id", conversionId);
          }
          send({ type: "error", error: message, conversionId: conversionId || undefined });
        } finally {
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}

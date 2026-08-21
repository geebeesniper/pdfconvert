import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { parseCoaPdf } from "@/lib/coa-parser";
import { resolveTemplate } from "@/lib/coa-normalizer";
import { generateExcel } from "@/lib/excel-generator";
import { getProject } from "@/lib/repository";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function safeBase(name: string) { return name.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-"); }

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const { sourcePath, sourceFileName } = await request.json();
  if (!sourcePath || !sourceFileName) return NextResponse.json({ error: "Missing uploaded PDF." }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data: row, error: insertError } = await db.from("conversions").insert({
    project_id: id, source_file_name: sourceFileName, source_storage_path: sourcePath, status: "processing",
  }).select("*").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const { data: pdfBlob, error: downloadError } = await db.storage.from("coa-sources").download(sourcePath);
    if (downloadError || !pdfBlob) throw downloadError || new Error("PDF could not be downloaded.");
    const parsed = await parseCoaPdf(new Uint8Array(await pdfBlob.arrayBuffer()));
    if (!parsed.items.length) throw new Error("No analysis table rows were detected. This PDF may be scanned and needs OCR.");
    const type = resolveTemplate(parsed, project.default_template);
    const generated = await generateExcel(parsed, project, type);
    const outputName = `${safeBase(sourceFileName)}-${type}-${randomUUID().slice(0,8)}.xlsx`;
    const outputPath = `${id}/${new Date().toISOString().slice(0,10)}/${outputName}`;
    const { error: uploadError } = await db.storage.from("coa-outputs").upload(outputPath, generated.buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: updated, error: updateError } = await db.from("conversions").update({
      status: "ready", output_file_name: outputName, output_storage_path: outputPath, template_type: type,
      product_name: generated.outputProduct, batch_number: generated.outputBatch,
      manufacturing_date: parsed.manufacturingDate || null, extracted_data: parsed, warning_count: parsed.warnings.length,
    }).eq("id", row.id).select("*").single();
    if (updateError) throw updateError;
    return NextResponse.json({ conversion: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Conversion failed.";
    await db.from("conversions").update({ status: "error", error_message: message }).eq("id", row.id);
    return NextResponse.json({ error: message, conversionId: row.id }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const db = getSupabaseAdmin();

  const { data: conversion, error: fetchError } = await db
    .from("conversions")
    .select("id,project_id,source_storage_path,output_storage_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!conversion) {
    return NextResponse.json({ error: "Conversion not found." }, { status: 404 });
  }

  // Delete stored files first. Missing files are harmless; storage remove simply
  // returns an empty result for paths that are already gone.
  if (conversion.source_storage_path) {
    const { error } = await db.storage.from("coa-sources").remove([conversion.source_storage_path]);
    if (error) {
      return NextResponse.json({ error: `Could not delete source PDF: ${error.message}` }, { status: 500 });
    }
  }

  if (conversion.output_storage_path) {
    const { error } = await db.storage.from("coa-outputs").remove([conversion.output_storage_path]);
    if (error) {
      return NextResponse.json({ error: `Could not delete Excel output: ${error.message}` }, { status: 500 });
    }
  }

  const { error: deleteError } = await db.from("conversions").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await db
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversion.project_id);

  return NextResponse.json({ ok: true });
}

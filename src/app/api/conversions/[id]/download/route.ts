import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const db = getSupabaseAdmin();
  const { data: conversion, error } = await db.from("conversions").select("output_storage_path,output_file_name,status").eq("id", id).single();
  if (error || !conversion || conversion.status !== "ready" || !conversion.output_storage_path) return NextResponse.json({ error: "Output not available." }, { status: 404 });
  const { data, error: signError } = await db.storage.from("coa-outputs").createSignedUrl(conversion.output_storage_path, 120, { download: conversion.output_file_name || true });
  if (signError || !data) return NextResponse.json({ error: signError?.message || "Could not create download link." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}

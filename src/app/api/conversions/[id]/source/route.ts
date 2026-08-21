import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const db = getSupabaseAdmin();
  const { data: conversion, error } = await db
    .from("conversions")
    .select("source_storage_path,source_file_name")
    .eq("id", id)
    .single();

  if (error || !conversion?.source_storage_path) {
    return NextResponse.json({ error: "Source PDF not available." }, { status: 404 });
  }

  const shouldDownload = new URL(request.url).searchParams.get("download") === "1";
  const options = shouldDownload
    ? { download: conversion.source_file_name || true }
    : undefined;

  const { data, error: signError } = await db.storage
    .from("coa-sources")
    .createSignedUrl(conversion.source_storage_path, 120, options);

  if (signError || !data) {
    return NextResponse.json(
      { error: signError?.message || "Could not create PDF link." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}

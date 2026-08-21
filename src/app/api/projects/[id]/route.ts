import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await request.json();
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("projects").update({
    name: b.name?.trim(), description: b.description?.trim() || null,
    default_template: b.defaultTemplate, output_product_name: b.outputProductName?.trim() || null,
    batch_prefix: b.batchPrefix?.trim() || null, updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}

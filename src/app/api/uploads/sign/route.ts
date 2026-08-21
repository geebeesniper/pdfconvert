import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getProject } from "@/lib/repository";
import { getSupabaseAdmin } from "@/lib/supabase";

function safeFileName(name: string) { return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-"); }

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, fileName } = await request.json();
  if (!fileName?.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
  if (!(await getProject(projectId))) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const path = `${projectId}/${new Date().toISOString().slice(0,10)}/${randomUUID()}-${safeFileName(fileName)}`;
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from("coa-sources").createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not create upload URL." }, { status: 500 });
  return NextResponse.json({ path, token: data.token });
}

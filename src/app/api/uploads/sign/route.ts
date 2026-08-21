import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getProject } from "@/lib/repository";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid, validateDeclaredFileSize, validatePdfFileName } from "@/lib/upload-security";

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 160);
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const projectId = body.projectId;
    if (!isUuid(projectId)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });

    const fileName = validatePdfFileName(body.fileName);
    validateDeclaredFileSize(body.fileSize);

    if (!(await getProject(projectId))) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const path = `${projectId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(fileName)}`;
    const db = getSupabaseAdmin();
    const { data, error } = await db.storage.from("coa-sources").createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });
    }

    return NextResponse.json({ path, token: data.token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid upload request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

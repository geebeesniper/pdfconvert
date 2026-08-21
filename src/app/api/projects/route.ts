import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { createProject } from "@/lib/repository";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await request.json();
    if (!b.name?.trim()) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    const project = await createProject({
      name: b.name.trim(), description: b.description?.trim(), defaultTemplate: b.defaultTemplate || "auto",
      outputProductName: b.outputProductName?.trim(), batchPrefix: b.batchPrefix?.trim(),
    });
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create project." }, { status: 500 });
  }
}

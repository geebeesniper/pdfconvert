import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { createProject } from "@/lib/repository";
import { validateProjectName } from "@/lib/upload-security";
import type { TemplateType } from "@/lib/types";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const b = await request.json().catch(() => null);
    if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const name = validateProjectName(b.name);
    const defaultTemplate: TemplateType = ["auto", "powder", "assay", "ratio"].includes(b.defaultTemplate)
      ? (b.defaultTemplate as TemplateType)
      : "auto";

    const project = await createProject({
      name,
      description: typeof b.description === "string" ? b.description.trim().slice(0, 500) : undefined,
      defaultTemplate,
      outputProductName: typeof b.outputProductName === "string" ? b.outputProductName.trim().slice(0, 200) : undefined,
      batchPrefix: typeof b.batchPrefix === "string" ? b.batchPrefix.trim().slice(0, 30) : undefined,
    });
    return NextResponse.json({ project });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create project.";
    const status = /required|characters|invalid/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

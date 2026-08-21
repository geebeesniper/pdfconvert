import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/upload-security";

export const runtime = "nodejs";
export const maxDuration = 20;

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid conversion id." }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  try {
    const result = await withTimeout(
      db
        .from("conversions")
        .select("id,source_storage_path,output_storage_path")
        .eq("id", id)
        .maybeSingle(),
      6_000,
      "History lookup",
    );

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    if (!result.data) {
      // Treat an already-deleted row as success. This makes DELETE idempotent
      // and prevents a retry from leaving the UI stuck.
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    const conversion = result.data;

    // Delete the database record first so the user-facing history disappears
    // even if Supabase Storage is temporarily slow. File cleanup is best effort
    // and each operation has its own hard timeout.
    const deleted = await withTimeout(
      db.from("conversions").delete().eq("id", id),
      6_000,
      "History deletion",
    );

    if (deleted.error) {
      return NextResponse.json({ error: deleted.error.message }, { status: 500 });
    }

    const cleanupWarnings: string[] = [];
    const cleanupJobs: Array<Promise<void>> = [];

    if (conversion.source_storage_path) {
      cleanupJobs.push(
        withTimeout(
          db.storage.from("coa-sources").remove([conversion.source_storage_path]),
          4_000,
          "Source PDF cleanup",
        )
          .then((result) => {
            if (result.error) cleanupWarnings.push(`Source PDF: ${result.error.message}`);
          })
          .catch((error) => {
            cleanupWarnings.push(error instanceof Error ? error.message : "Source PDF cleanup failed.");
          }),
      );
    }

    if (conversion.output_storage_path) {
      cleanupJobs.push(
        withTimeout(
          db.storage.from("coa-outputs").remove([conversion.output_storage_path]),
          4_000,
          "Excel cleanup",
        )
          .then((result) => {
            if (result.error) cleanupWarnings.push(`Excel: ${result.error.message}`);
          })
          .catch((error) => {
            cleanupWarnings.push(error instanceof Error ? error.message : "Excel cleanup failed.");
          }),
      );
    }

    if (cleanupJobs.length) {
      await Promise.allSettled(cleanupJobs);
    }

    return NextResponse.json({
      ok: true,
      cleanupWarnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete this conversion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { Conversion, Project } from "./types";

export const WORKSPACE_PROJECT_ID = "22222222-2222-4222-8222-222222222222";

const workspaceProject: Project = {
  id: WORKSPACE_PROJECT_ID,
  name: "COA Workspace",
  description: "Internal workspace used by the flat COA dashboard.",
  default_template: "auto",
  output_product_name: null,
  batch_prefix: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  conversion_count: 0,
  ready_count: 0,
  error_count: 0,
  last_conversion_at: null,
};

export async function ensureWorkspaceProject(): Promise<Project> {
  if (!isSupabaseConfigured()) return workspaceProject;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("projects")
    .upsert(
      {
        id: WORKSPACE_PROJECT_ID,
        name: workspaceProject.name,
        description: workspaceProject.description,
        default_template: "auto",
        output_product_name: null,
        batch_prefix: null,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as Project;
}

export async function listAllConversions(): Promise<Conversion[]> {
  if (!isSupabaseConfigured()) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("conversions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw error;
  return (data ?? []) as Conversion[];
}

export async function getProject(id: string): Promise<Project | null> {
  if (id !== WORKSPACE_PROJECT_ID) return null;
  if (!isSupabaseConfigured()) return workspaceProject;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Project | null;
}

import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { Conversion, Project, TemplateType } from "./types";

const demoProject: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Organic Chasteberry Powder",
  description: "Sample project based on the supplied Chaste Berry COA.",
  default_template: "powder",
  output_product_name: "Organic Chasteberry Powder",
  batch_prefix: "OCP",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  conversion_count: 0,
  ready_count: 0,
  error_count: 0,
  last_conversion_at: null,
};

export async function listProjects(): Promise<Project[]> {
  if (!isSupabaseConfigured()) return [demoProject];
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("project_dashboard").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  if (!isSupabaseConfigured()) return id === demoProject.id ? demoProject : null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Project | null;
}

export async function listConversions(projectId: string): Promise<Conversion[]> {
  if (!isSupabaseConfigured()) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("conversions").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as Conversion[];
}

export async function createProject(input: {
  name: string;
  description?: string;
  defaultTemplate: TemplateType;
  outputProductName?: string;
  batchPrefix?: string;
}) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("projects").insert({
    name: input.name,
    description: input.description || null,
    default_template: input.defaultTemplate,
    output_product_name: input.outputProductName || null,
    batch_prefix: input.batchPrefix || null,
  }).select("*").single();
  if (error) throw error;
  return data as Project;
}

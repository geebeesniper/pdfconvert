import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listProjects } from "@/lib/repository";
import { isSupabaseConfigured } from "@/lib/supabase";
import { LogoutButton } from "@/components/logout-button";
import { NewProjectForm } from "@/components/new-project-form";

function date(v?: string | null) {
  return v
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(v))
    : "No conversions yet";
}

export default async function ProjectsPage() {
  await requireAdmin();
  const projects = await listProjects();
  const configured = isSupabaseConfigured();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><span className="logo-chip">K</span><strong>COA Converter</strong></div>
        <div className="top-actions">
          <span className="environment">{configured ? "Supabase connected" : "Demo mode"}</span>
          <LogoutButton />
        </div>
      </header>

      <div className="content projects-content">
        <div className="projects-title-row">
          <div>
            <p className="eyebrow">PROJECTS</p>
            <h1>COA projects</h1>
          </div>
          <span className="project-count">{projects.length} project{projects.length === 1 ? "" : "s"}</span>
        </div>

        <div className="project-grid">
          <NewProjectForm enabled={configured} />

          {projects.map((p) => (
            <Link className="project-card" href={`/projects/${p.id}`} key={p.id}>
              <div className="project-card-top">
                <span className="template-badge">{p.default_template}</span>
                <span className="arrow">↗</span>
              </div>
              <h3>{p.name}</h3>
              <p className="project-activity">{date(p.last_conversion_at)}</p>
              <div className="project-metrics compact-metrics">
                <div><strong>{p.conversion_count || 0}</strong><span>Conversions</span></div>
                <div><strong>{p.ready_count || 0}</strong><span>Ready</span></div>
                <div><strong>{p.error_count || 0}</strong><span>Errors</span></div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

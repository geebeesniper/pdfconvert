import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, listConversions } from "@/lib/repository";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Converter } from "@/components/converter";
import { ProjectSettingsForm } from "@/components/project-settings-form";
import { DeleteConversionButton } from "@/components/delete-conversion-button";

function date(v: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(v));
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const foundProject = await getProject(id);
  if (!foundProject) notFound();
  const project = foundProject as NonNullable<typeof foundProject>;
  const history = await listConversions(id);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <Link href="/projects" className="back">← Projects</Link>
          <span className="slash">/</span>
          <strong>{project.name}</strong>
        </div>
        <div className="top-actions">
          <span className="environment">{isSupabaseConfigured() ? "Supabase connected" : "Demo mode"}</span>
        </div>
      </header>

      <div className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PROJECT</p>
            <h1>{project.name}</h1>
            <p>{project.description || "Convert and track COAs for this project."}</p>
          </div>
          <div className="project-tags">
            <span>{project.default_template} template</span>
            {project.batch_prefix && <span>Batch: {project.batch_prefix}+date</span>}
          </div>
        </div>

        <Converter projectId={id} enabled={isSupabaseConfigured()} />
        <ProjectSettingsForm project={project} />

        <section>
          <div className="section-head">
            <div><h2>Conversion history</h2><span>Newest first · stored by project</span></div>
            <strong>{history.length}</strong>
          </div>

          {history.length === 0 ? (
            <div className="empty-state">
              <div>▦</div>
              <h3>No conversions yet</h3>
              <p>Upload the first supplier COA above. The generated Excel and its metadata will appear here.</p>
            </div>
          ) : (
            <div className="history-grid">
              {history.map((c) => (
                <article className="history-card" key={c.id}>
                  <div className="history-top">
                    <span className={`status-pill ${c.status}`}>{c.status}</span>
                    <span className="template-badge">{c.template_type || "pending"}</span>
                  </div>
                  <h3>{c.product_name || c.source_file_name}</h3>
                  <p className="file-name">{c.source_file_name}</p>
                  <div className="history-meta">
                    <div><span>Batch</span><strong>{c.batch_number || "—"}</strong></div>
                    <div><span>Converted</span><strong>{date(c.created_at)}</strong></div>
                    <div><span>Warnings</span><strong>{c.warning_count}</strong></div>
                  </div>
                  {c.error_message && <div className="notice error compact">{c.error_message}</div>}
                  <div className="history-actions">
                    <div>
                      {c.status === "ready"
                        ? <a className="primary small" href={`/api/conversions/${c.id}/download`}>Download Excel</a>
                        : <span className="muted">Output unavailable</span>}
                    </div>
                    <DeleteConversionButton id={c.id} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

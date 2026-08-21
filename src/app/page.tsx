import { Converter } from "@/components/converter";
import { DeleteConversionButton } from "@/components/delete-conversion-button";
import { ensureWorkspaceProject, listAllConversions } from "@/lib/repository";
import { isSupabaseConfigured } from "@/lib/supabase";

function date(v: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(v));
}

export default async function HomePage() {
  const configured = isSupabaseConfigured();
  const workspace = await ensureWorkspaceProject();
  const history = await listAllConversions();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><span className="logo-chip">K</span><strong>COA Converter</strong></div>
        <div className="top-actions">
          <span className="environment">{configured ? "Supabase connected" : "Demo mode"}</span>
        </div>
      </header>

      <div className="content flat-dashboard">
        <Converter projectId={workspace.id} enabled={configured} />

        <section className="all-history-section">
          <div className="section-head">
            <div>
              <h2>History</h2>
              <span>All conversions · newest first</span>
            </div>
            <strong>{history.length}</strong>
          </div>

          {history.length === 0 ? (
            <div className="empty-state">
              <div>▦</div>
              <h3>No conversions yet</h3>
              <p>Drop a COA PDF above. The generated Excel and conversion record will appear here.</p>
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

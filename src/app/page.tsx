import { Converter } from "@/components/converter";
import { HistoryList, type HistoryItem } from "@/components/history-list";
import { ensureWorkspaceProject, listAllConversions } from "@/lib/repository";
import { isSupabaseConfigured } from "@/lib/supabase";

// This page is a live SaaS dashboard. Never prerender or reuse a stale History
// result after create/delete operations.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const configured = isSupabaseConfigured();
  const workspace = await ensureWorkspaceProject();
  const rows = await listAllConversions();

  const history: HistoryItem[] = rows.map((c) => ({
    id: c.id,
    source_file_name: c.source_file_name,
    template_type: c.template_type,
    status: c.status,
    product_name: c.product_name,
    batch_number: c.batch_number,
    warning_count: c.warning_count,
    error_message: c.error_message,
    created_at: c.created_at,
  }));

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
        <HistoryList initialHistory={history} />
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { DeleteConversionButton } from "@/components/delete-conversion-button";

export type HistoryItem = {
  id: string;
  source_file_name: string;
  template_type: string | null;
  status: "processing" | "ready" | "error";
  product_name: string | null;
  batch_number: string | null;
  warning_count: number;
  error_message: string | null;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function HistoryList({ initialHistory }: { initialHistory: HistoryItem[] }) {
  const [history, setHistory] = useState(initialHistory);

  // router.refresh() after a conversion sends fresh server props into this
  // mounted client component. Synchronize them instead of keeping the first
  // render forever.
  useEffect(() => {
    setHistory(initialHistory);
  }, [initialHistory]);

  function removeFromHistory(id: string) {
    setHistory((current) => current.filter((item) => item.id !== id));
  }

  return (
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
                <div><span>Converted</span><strong>{formatDate(c.created_at)}</strong></div>
                <div><span>Warnings</span><strong>{c.warning_count}</strong></div>
              </div>
              {c.error_message && <div className="notice error compact">{c.error_message}</div>}
              <div className="history-actions">
                <div>
                  {c.status === "ready"
                    ? <a className="primary small" href={`/api/conversions/${c.id}/download`}>Download Excel</a>
                    : <span className="muted">Output unavailable</span>}
                </div>
                <DeleteConversionButton id={c.id} onDeleted={removeFromHistory} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";

export function DeleteConversionButton({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted?: (id: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`/api/conversions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not delete this conversion.");

      // Do not depend on router.refresh() to make a deleted card disappear.
      // The History client state is the immediate source of truth for the UI.
      onDeleted?.(id);
      setArmed(false);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Delete timed out. Please retry.");
      } else {
        setError(e instanceof Error ? e.message : "Could not delete this conversion.");
      }
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  }

  if (!armed) {
    return (
      <button className="danger-link" type="button" onClick={() => setArmed(true)}>
        Delete
      </button>
    );
  }

  return (
    <div className="delete-confirmation">
      <span>Delete PDF, Excel and history?</span>
      <div className="delete-confirmation-actions">
        <button
          className="ghost small"
          type="button"
          disabled={busy}
          onClick={() => {
            setArmed(false);
            setError("");
          }}
        >
          Cancel
        </button>
        <button className="danger small" type="button" disabled={busy} onClick={remove}>
          {busy ? "Deleting…" : "Delete now"}
        </button>
      </div>
      {error && <div className="notice error compact">{error}</div>}
    </div>
  );
}

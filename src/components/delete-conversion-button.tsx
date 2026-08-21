"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteConversionButton({ id }: { id: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    setWarning("");

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

      if (Array.isArray(data.cleanupWarnings) && data.cleanupWarnings.length) {
        setWarning("History deleted. One stored file may need cleanup later.");
      }

      setArmed(false);
      router.refresh();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Delete timed out. Refresh the page to check whether the history was removed.");
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
      <div>
        <button className="danger-link" type="button" onClick={() => setArmed(true)}>
          Delete
        </button>
        {warning && <div className="notice warning compact">{warning}</div>}
      </div>
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

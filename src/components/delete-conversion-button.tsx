"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteConversionButton({ id }: { id: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/conversions/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not delete this conversion.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this conversion.");
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
        <button className="ghost small" type="button" disabled={busy} onClick={() => { setArmed(false); setError(""); }}>
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

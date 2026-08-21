"use client";

import { createClient } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

function suggestedProjectName(fileName: string) {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/^coa[\s_-]*/i, "")
    .replace(/[\s_-]+(?:[A-Z]{1,6})?\d{6,}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "New COA Project";
}

export function NewProjectForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  function chooseFile() {
    setError("");
    if (!enabled) {
      setError("Supabase is not configured.");
      return;
    }
    inputRef.current?.click();
  }

  function onFileSelected(selected?: File) {
    if (!selected) return;
    if (!(selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf"))) {
      setError("Please choose a PDF file.");
      return;
    }
    setFile(selected);
    setName(suggestedProjectName(selected.name));
    setError("");
  }

  function close() {
    if (busy) return;
    setFile(null);
    setName("");
    setProgress("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function createAndConvert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !name.trim() || busy) return;

    setBusy(true);
    setError("");
    let projectId = "";

    try {
      setProgress("Creating project…");
      const createResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          defaultTemplate: "auto",
        }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok) throw new Error(created.error || "Could not create project.");
      projectId = created.project.id;

      setProgress("Uploading PDF…");
      const signResponse = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, fileName: file.name }),
      });
      const signed = await signResponse.json();
      if (!signResponse.ok) throw new Error(signed.error || "Could not prepare upload.");

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !publishableKey) throw new Error("Supabase environment variables are missing.");

      const supabase = createClient(url, publishableKey);
      const upload = await supabase.storage
        .from("coa-sources")
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: "application/pdf" });
      if (upload.error) throw upload.error;

      setProgress("Converting to Excel…");
      const convertResponse = await fetch(`/api/projects/${projectId}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourcePath: signed.path, sourceFileName: file.name }),
      });
      const converted = await convertResponse.json();
      if (!convertResponse.ok) throw new Error(converted.error || "Conversion failed.");

      setProgress("Ready");
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project.");
      setProgress("");
      if (projectId) {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => onFileSelected(e.target.files?.[0])}
      />

      <button className="project-card add-project-card" type="button" onClick={chooseFile}>
        <span className="add-project-icon">+</span>
        <strong>New project</strong>
        <span>Upload a COA PDF</span>
      </button>

      {file && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <section className="quick-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
            <div className="quick-modal-head">
              <div>
                <p className="eyebrow">NEW PROJECT</p>
                <h2 id="new-project-title">Name this project</h2>
              </div>
              <button type="button" className="icon-button" onClick={close} disabled={busy} aria-label="Close">×</button>
            </div>

            <div className="selected-pdf">
              <div className="pdf-icon">PDF</div>
              <div>
                <strong>{file.name}</strong>
                <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
              </div>
              <button type="button" className="text-button" disabled={busy} onClick={() => inputRef.current?.click()}>Change</button>
            </div>

            <form className="quick-project-form" onSubmit={createAndConvert}>
              <label>
                Project name
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                  required
                  disabled={busy}
                />
              </label>

              {progress && <div className="conversion-progress"><span className="progress-spinner" />{progress}</div>}
              {error && <div className="notice error">{error}</div>}

              <div className="quick-modal-actions">
                <button type="button" className="ghost" onClick={close} disabled={busy}>Cancel</button>
                <button className="primary" disabled={busy || !name.trim()}>
                  {busy ? "Working…" : "Create & convert"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {error && !file && <div className="floating-error notice error">{error}</div>}
    </>
  );
}

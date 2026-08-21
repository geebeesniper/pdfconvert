"use client";

import { createClient } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PDF_BYTES, validatePdfFileName } from "@/lib/upload-security";

export function Converter({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  async function selectFile(selected?: File) {
    if (!selected) return;
    try {
      validatePdfFileName(selected.name);
      if (selected.type && selected.type !== "application/pdf") throw new Error("Please choose a PDF file.");
      if (selected.size <= 0) throw new Error("The PDF is empty.");
      if (selected.size > MAX_PDF_BYTES) throw new Error(`PDF is too large. Maximum size is ${MAX_PDF_BYTES / 1024 / 1024} MB.`);
      const head = new Uint8Array(await selected.slice(0, 1024).arrayBuffer());
      if (!new TextDecoder("latin1").decode(head).includes("%PDF-")) throw new Error("This file does not contain a valid PDF header.");
      setFile(selected);
      setError("");
    } catch (err) {
      setFile(null);
      setError(err instanceof Error ? err.message : "Please choose a valid PDF file.");
      if (input.current) input.current.value = "";
    }
  }

  async function convert() {
    if (!file || !enabled) return;
    setError("");
    try {
      setProgress("Preparing secure upload…");
      const sign = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, fileName: file.name, fileSize: file.size }),
      });
      const sd = await sign.json();
      if (!sign.ok) throw new Error(sd.error || "Could not prepare upload.");

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON key missing.");

      setProgress("Uploading PDF…");
      const supabase = createClient(url, anon);
      const up = await supabase.storage.from("coa-sources").uploadToSignedUrl(sd.path, sd.token, file, { contentType: "application/pdf" });
      if (up.error) throw up.error;

      setProgress("Extracting COA and building Excel…");
      const res = await fetch(`/api/projects/${projectId}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourcePath: sd.path, sourceFileName: file.name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Conversion failed.");

      setProgress("Ready. Added to history.");
      setFile(null);
      if (input.current) input.current.value = "";
      router.refresh();
      setTimeout(() => setProgress(""), 3000);
    } catch (err) {
      setProgress("");
      setError(err instanceof Error ? err.message : "Conversion failed.");
    }
  }

  return (
    <section className="panel upload-panel">
      <div className="panel-title">
        <div><strong>Convert a COA</strong><span>PDF → Excel → history</span></div>
        <span className="status-dot ready" />
      </div>
      {!enabled && <div className="notice warning">Supabase is not configured yet. Run <code>supabase/schema.sql</code> and add the Vercel environment variables.</div>}
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void selectFile(e.dataTransfer.files[0]); }}
        onClick={() => enabled && input.current?.click()}
      >
        <input ref={input} hidden type="file" accept="application/pdf,.pdf" onChange={(e) => void selectFile(e.target.files?.[0])} />
        <div className="upload-icon">↑</div>
        <strong>{file ? file.name : "Drop COA PDF here"}</strong>
        <span>{file ? `${(file.size / 1024).toFixed(0)} KB selected` : `PDF only · max ${MAX_PDF_BYTES / 1024 / 1024} MB`}</span>
      </div>
      {error && <div className="notice error">{error}</div>}
      {progress && <div className="notice success">{progress}</div>}
      <div className="actions">
        <span className="muted">Malformed, oversized and non-PDF uploads are rejected before conversion.</span>
        <button className="primary" disabled={!file || !enabled || Boolean(progress)} onClick={convert}>Convert to Excel</button>
      </div>
    </section>
  );
}

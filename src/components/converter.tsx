"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PDF_BYTES, validatePdfFileName } from "@/lib/upload-security";

type JobStatus = "idle" | "working" | "ready" | "error";

type JobState = {
  status: JobStatus;
  stage: string;
  detail: string;
  progress: number;
  startedAt: number | null;
};

type StreamEvent = {
  type: "stage" | "done" | "error";
  stage?: string;
  detail?: string;
  progress?: number;
  conversionId?: string;
  error?: string;
};

const idleJob: JobState = {
  status: "idle",
  stage: "",
  detail: "",
  progress: 0,
  startedAt: null,
};

function humanSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function jsonOrEmpty(response: Response) {
  return response.json().catch(() => ({} as Record<string, unknown>));
}

async function withClientTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out. Please retry.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function Converter({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<JobState>(idleJob);
  const [elapsed, setElapsed] = useState(0);

  const busy = job.status === "working";

  useEffect(() => {
    if (!busy || !job.startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - job.startedAt!) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [busy, job.startedAt]);

  function updateJob(stage: string, detail: string, progress: number) {
    setJob((current) => ({
      status: "working",
      stage,
      detail,
      progress: Math.max(current.progress, Math.min(99, progress)),
      startedAt: current.startedAt ?? Date.now(),
    }));
  }

  async function selectFile(selected?: File) {
    if (!selected || busy) return;
    try {
      validatePdfFileName(selected.name);
      if (selected.type && selected.type !== "application/pdf") throw new Error("Please choose a PDF file.");
      if (selected.size <= 0) throw new Error("The PDF is empty.");
      if (selected.size > MAX_PDF_BYTES) throw new Error(`PDF is too large. Maximum size is ${MAX_PDF_BYTES / 1024 / 1024} MB.`);
      const head = new Uint8Array(await selected.slice(0, 1024).arrayBuffer());
      if (!new TextDecoder("latin1").decode(head).includes("%PDF-")) throw new Error("This file does not contain a valid PDF header.");
      setFile(selected);
      setError("");
      setJob(idleJob);
    } catch (err) {
      setFile(null);
      setJob(idleJob);
      setError(err instanceof Error ? err.message : "Please choose a valid PDF file.");
      if (input.current) input.current.value = "";
    }
  }

  async function consumeConversionStream(response: Response) {
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.includes("application/x-ndjson")) {
      const data = await jsonOrEmpty(response);
      const message = typeof data.error === "string" ? data.error : "Conversion could not be started.";
      throw new Error(message);
    }
    if (!response.body) throw new Error("The conversion service returned no progress stream.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let event: StreamEvent;
        try {
          event = JSON.parse(line) as StreamEvent;
        } catch {
          continue;
        }

        if (event.type === "stage") {
          updateJob(event.stage || "Working", event.detail || "Processing your COA…", event.progress ?? 50);
        } else if (event.type === "error") {
          throw new Error(event.error || "Conversion failed.");
        } else if (event.type === "done") {
          completed = true;
          setJob({
            status: "ready",
            stage: "Excel ready",
            detail: "The file was generated and added to History.",
            progress: 100,
            startedAt: job.startedAt ?? Date.now(),
          });
        }
      }
    }

    if (!completed) throw new Error("The conversion ended before Excel was generated. Please retry.");
  }

  async function convert() {
    if (!file || !enabled || busy) return;
    setError("");
    setJob({
      status: "working",
      stage: "Preparing upload",
      detail: "Creating a secure upload session…",
      progress: 5,
      startedAt: Date.now(),
    });

    try {
      const sign = await withClientTimeout(
        fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId, fileName: file.name, fileSize: file.size }),
        }),
        12_000,
        "Upload preparation",
      );
      const sd = await jsonOrEmpty(sign);
      if (!sign.ok) throw new Error(typeof sd.error === "string" ? sd.error : "Could not prepare upload.");
      if (typeof sd.path !== "string" || typeof sd.token !== "string") throw new Error("Upload session was incomplete.");

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon) throw new Error("Supabase public configuration is missing.");

      updateJob("Uploading PDF", `${humanSize(file.size)} · encrypted HTTPS upload`, 18);
      const supabase = createClient(url, anon);
      const up = await withClientTimeout(
        supabase.storage.from("coa-sources").uploadToSignedUrl(sd.path, sd.token, file, { contentType: "application/pdf" }),
        20_000,
        "PDF upload",
      );
      if (up.error) throw up.error;

      updateJob("Queued", "Upload complete. Starting COA extraction…", 30);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55_000);
      let response: Response;
      try {
        response = await fetch(`/api/projects/${projectId}/convert`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourcePath: sd.path, sourceFileName: file.name }),
          signal: controller.signal,
        });
        await consumeConversionStream(response);
      } catch (streamError) {
        if (controller.signal.aborted) throw new Error("Conversion took too long. The job was stopped safely; please retry.");
        throw streamError;
      } finally {
        clearTimeout(timeout);
      }

      setFile(null);
      if (input.current) input.current.value = "";
      router.refresh();
      setTimeout(() => setJob(idleJob), 4500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Conversion failed.";
      setError(message);
      setJob((current) => ({
        status: "error",
        stage: "Conversion failed",
        detail: message,
        progress: current.progress,
        startedAt: current.startedAt,
      }));
      router.refresh();
    }
  }

  const buttonLabel = busy
    ? `${job.stage}…`
    : job.status === "error"
      ? "Retry export"
      : "Export to Excel";

  return (
    <section className="panel upload-panel saas-converter">
      <div className="panel-title">
        <div><strong>COA Converter</strong><span>Drop PDF → process → Excel → History</span></div>
        <span className={`service-pill ${busy ? "busy" : "online"}`}>{busy ? "Processing" : "Ready"}</span>
      </div>

      {!enabled && <div className="notice warning">Supabase is not configured yet. Add the Vercel environment variables before converting.</div>}

      <div
        className={`dropzone ${drag ? "drag" : ""} ${file ? "has-file" : ""} ${busy ? "locked" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void selectFile(e.dataTransfer.files[0]); }}
        onClick={() => enabled && !busy && input.current?.click()}
      >
        <input ref={input} hidden type="file" accept="application/pdf,.pdf" onChange={(e) => void selectFile(e.target.files?.[0])} />
        <div className="upload-icon">{file ? "PDF" : "↑"}</div>
        <strong>{file ? file.name : "Drop COA PDF here"}</strong>
        <span>{file ? `${humanSize(file.size)} · ready to export` : `PDF only · max ${MAX_PDF_BYTES / 1024 / 1024} MB`}</span>
      </div>

      {(busy || job.status === "ready" || job.status === "error") && (
        <div className={`job-card ${job.status}`} aria-live="polite">
          <div className="job-card-head">
            <div className="job-status-icon">{job.status === "ready" ? "✓" : job.status === "error" ? "!" : <span className="progress-spinner" />}</div>
            <div className="job-copy">
              <strong>{job.stage}</strong>
              <span>{job.detail}</span>
            </div>
            <div className="job-percent">{Math.round(job.progress)}%</div>
          </div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${job.progress}%` }} /></div>
          <div className="job-steps" aria-hidden="true">
            <span className={job.progress >= 18 ? "done" : "active"}>Upload</span>
            <span className={job.progress >= 45 ? "done" : job.progress >= 18 ? "active" : ""}>Read PDF</span>
            <span className={job.progress >= 66 ? "done" : job.progress >= 45 ? "active" : ""}>Map COA</span>
            <span className={job.progress >= 86 ? "done" : job.progress >= 66 ? "active" : ""}>Build Excel</span>
            <span className={job.progress >= 100 ? "done" : job.progress >= 86 ? "active" : ""}>Save</span>
          </div>
          {busy && <div className="job-timer">Running {elapsed}s · this page stays responsive while the job runs</div>}
        </div>
      )}

      {error && job.status !== "error" && <div className="notice error">{error}</div>}

      <div className="actions converter-actions">
        <span className="muted">Invalid, oversized or malformed files fail safely and show an error instead of freezing the page.</span>
        <div className="converter-buttons">
          {file && !busy && (
            <button className="ghost" onClick={() => { setFile(null); setError(""); setJob(idleJob); if (input.current) input.current.value = ""; }}>
              Remove
            </button>
          )}
          <button className="primary export-button" disabled={!file || !enabled || busy} onClick={convert}>{buttonLabel}</button>
        </div>
      </div>
    </section>
  );
}

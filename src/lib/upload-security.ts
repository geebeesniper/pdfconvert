export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 5;
export const MAX_EXTRACTED_TEXT_CHARS = 200_000;
export const MAX_ANALYSIS_ROWS = 120;
export const MAX_PROJECT_NAME_CHARS = 120;
export const MAX_FILE_NAME_CHARS = 180;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function validatePdfFileName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid file name.");
  const name = value.trim();
  if (!name || name.length > MAX_FILE_NAME_CHARS) throw new Error("PDF file name is too long.");
  if (name.includes("\0") || name.includes("/") || name.includes("\\")) throw new Error("Invalid PDF file name.");
  if (!name.toLowerCase().endsWith(".pdf")) throw new Error("Only PDF files are accepted.");
  return name;
}

export function validateDeclaredFileSize(value: unknown): number {
  const size = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(size) || !Number.isInteger(size) || size <= 0) throw new Error("Invalid PDF file size.");
  if (size > MAX_PDF_BYTES) throw new Error(`PDF is too large. Maximum size is ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)} MB.`);
  return size;
}

export function validateProjectName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Project name is required.");
  const name = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Project name is required.");
  if (name.length > MAX_PROJECT_NAME_CHARS) throw new Error(`Project name must be ${MAX_PROJECT_NAME_CHARS} characters or fewer.`);
  return name;
}

export function assertPdfBytes(bytes: Uint8Array) {
  if (!bytes.byteLength) throw new Error("The uploaded PDF is empty.");
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error(`PDF is too large. Maximum size is ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)} MB.`);

  // PDF headers are normally byte 0. The spec allows some leading bytes, so
  // inspect only the first 1 KB and require a real %PDF- signature there.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(1024, bytes.byteLength)));
  if (!head.includes("%PDF-")) throw new Error("The uploaded file is not a valid PDF.");
}

export function safeStorageSourcePath(projectId: string, sourcePath: unknown): string {
  if (typeof sourcePath !== "string" || sourcePath.length > 500) throw new Error("Invalid uploaded PDF path.");
  if (!sourcePath.startsWith(`${projectId}/`)) throw new Error("Uploaded PDF does not belong to this project.");
  if (sourcePath.includes("..") || sourcePath.includes("\\") || sourcePath.includes("\0")) throw new Error("Invalid uploaded PDF path.");
  if (!sourcePath.toLowerCase().endsWith(".pdf")) throw new Error("Only PDF files are accepted.");
  return sourcePath;
}

export function safeClientError(error: unknown) {
  const message = error instanceof Error ? error.message : "Conversion failed.";
  const allowed = [
    "PDF is too large",
    "uploaded file is not a valid PDF",
    "uploaded PDF is empty",
    "Only PDF files are accepted",
    "PDF file name is too long",
    "Invalid PDF",
    "Project not found",
    "No COA analysis fields could be mapped",
    "OCR is required",
    "supplier layout needs a new extraction rule",
    "too many pages",
    "too much extractable text",
  ];
  return allowed.some((x) => message.toLowerCase().includes(x.toLowerCase())) ? message : "This PDF could not be processed safely. The conversion was stopped.";
}

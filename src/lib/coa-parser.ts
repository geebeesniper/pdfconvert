import { extractText, extractTextItems, getDocumentProxy } from "unpdf";
import type { StructuredTextItem } from "unpdf";
import type { AnalysisItem, ParsedCoa } from "./types";

function clean(s: string) {
  return s.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function dateToIso(value: string) {
  const v = clean(value);
  const iso = v.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const d = new Date(`${v} UTC`);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return v;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capture(text: string, labels: string[], stopLabels: string[]) {
  const stops = stopLabels.map(escapeRe).join("|");
  for (const label of labels) {
    const re = new RegExp(`${escapeRe(label)}\\s+(.+?)(?=\\s+(?:${stops})\\s+|\\n|$)`, "i");
    const m = text.match(re);
    if (m) return clean(m[1]);
  }
  return "";
}

/** Rebuild visual PDF rows from positioned PDF.js text items. */
function linesFromItems(pages: StructuredTextItem[][]) {
  const output: string[] = [];
  for (const page of pages) {
    const sorted = [...page].filter((x) => clean(x.str)).sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: StructuredTextItem[][] = [];
    for (const item of sorted) {
      let row = rows.find((r) => Math.abs((r[0]?.y ?? 0) - item.y) <= 2.2);
      if (!row) {
        row = [];
        rows.push(row);
      }
      row.push(item);
    }
    rows.sort((a, b) => (b[0]?.y ?? 0) - (a[0]?.y ?? 0));
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      let line = "";
      let previousEnd = 0;
      for (const item of row) {
        const gap = item.x - previousEnd;
        if (line) line += gap > Math.max(14, item.fontSize * 1.25) ? "    " : " ";
        line += item.str;
        previousEnd = item.x + item.width;
      }
      if (clean(line)) output.push(line.trimEnd());
    }
    output.push("");
  }
  return output;
}

const knownItems = [
  "Identification", "Appearance", "Color", "Odor", "Taste", "Bulk Density", "Mesh Size",
  "Sieve Analysis", "Ash", "Loss on Drying", "Heavy Metals", "Arsenic (As)", "Lead (Pb)",
  "Mercury (Hg)", "Cadmium (Cd)", "Pesticides Residue", "Total Place Count", "Total Plate Count",
  "Total Yeast & Mold", "Yeast & Mold", "E. Coli.", "Salmonella", "Staphylococcus aureus", "Staphylococcus",
  "Assay", "Ratio"
];

function splitRow(line: string): [string, string, string, string] | null {
  const candidate = clean(line);
  const item = knownItems.find((name) => candidate.toLowerCase().startsWith(name.toLowerCase()));
  if (!item) return null;

  const spaced = line.trim().split(/\s{2,}/).map(clean).filter(Boolean);
  if (spaced.length >= 4 && spaced[0].toLowerCase().startsWith(item.toLowerCase())) {
    return [item, spaced[1], spaced[2], spaced.slice(3).join(" ")];
  }

  let rest = clean(candidate.slice(item.length));
  if (!rest) return null;
  const methodMatch = rest.match(/\s+(USP\s*<[^>]+>(?:\s*Method\s*I)?|ICP-MS|Organoleptic|Visual|TLC|80\s*Mesh\s*Screen|HPLC|UV|GC|\/)$|\s+(USP<[^>]+>Method I)$/i);
  if (!methodMatch || methodMatch.index == null) return null;
  const method = clean(methodMatch[1] || methodMatch[2]);
  rest = clean(rest.slice(0, methodMatch.index));
  const resultMatch = rest.match(/\s+(Complies|Conforms|Negative|Positive|\d+(?:[,.]\d+)*(?:g\/100mL|cfu\/g|ppm|%|:\s*1)|[≤<]\s*[0-9,.]+\s*(?:cfu\/g|ppm|%))$/i);
  if (!resultMatch || resultMatch.index == null) return null;
  return [item, clean(rest.slice(0, resultMatch.index)), clean(resultMatch[1]), method];
}

function parseTable(lines: string[]): AnalysisItem[] {
  const items: AnalysisItem[] = [];
  let section: AnalysisItem["section"] = "chemical";
  for (const line of lines) {
    const c = clean(line);
    if (/microbiolog/i.test(c)) { section = "microbiology"; continue; }
    if (/chemical\/physical|analytical data/i.test(c)) { section = "chemical"; continue; }
    const row = splitRow(line);
    if (!row) continue;
    const rowSection = /^(Assay|Ratio)$/i.test(row[0]) ? "special" : section;
    items.push({ item: row[0], specification: row[1], result: row[2], testMethod: row[3], section: rowSection });
  }
  return items;
}

export async function parseCoaPdf(pdfBytes: Uint8Array): Promise<ParsedCoa> {
  const pdf = await getDocumentProxy(pdfBytes);
  const structured = await extractTextItems(pdf);
  const structuredLines = linesFromItems(structured.items);
  const merged = await extractText(pdf, { mergePages: true });
  // unpdf returns a single string when mergePages is true. Keep the value
  // normalized through unknown so this also stays compatible if unpdf changes
  // the return shape in a future version.
  const mergedText: unknown = merged.text;
  const fallbackText = Array.isArray(mergedText)
    ? mergedText.map((value) => String(value)).join("\n")
    : typeof mergedText === "string"
      ? mergedText
      : mergedText == null
        ? ""
        : String(mergedText);
  const rawText: string = structuredLines.filter(Boolean).length > 4
    ? structuredLines.join("\n")
    : fallbackText;
  const lines: string[] = rawText.split(/\r?\n/).filter((x: string) => Boolean(clean(x)));
  const labels = ["Product Name", "Botanical Source", "Batch Number", "Part Used", "Country of Origin", "Production Date", "Manufacturing Date", "Expiration Date", "ANALYSIS", "Items of Analysis"];

  const productName = capture(rawText, ["Product Name"], labels.filter((x) => x !== "Product Name"));
  const botanicalSource = capture(rawText, ["Botanical Source"], labels.filter((x) => x !== "Botanical Source"));
  const batchNumber = capture(rawText, ["Batch Number"], labels.filter((x) => x !== "Batch Number"));
  const partUsed = capture(rawText, ["Part Used"], labels.filter((x) => x !== "Part Used"));
  const countryOfOrigin = capture(rawText, ["Country of Origin"], labels.filter((x) => x !== "Country of Origin"));
  const manufacturingDate = dateToIso(capture(rawText, ["Production Date", "Manufacturing Date"], labels.filter((x) => !/Production Date|Manufacturing Date/.test(x))));
  const expirationDate = dateToIso(capture(rawText, ["Expiration Date"], labels.filter((x) => x !== "Expiration Date")));
  const items = parseTable(lines);
  const warnings: string[] = [];
  if (!productName) warnings.push("Product Name was not detected.");
  if (!batchNumber) warnings.push("Batch Number was not detected.");
  if (!manufacturingDate) warnings.push("Manufacturing Date was not detected.");
  if (!items.length) warnings.push("No analysis rows were detected. This PDF may need OCR or a supplier-specific parser.");

  return { productName, botanicalSource, partUsed, batchNumber, countryOfOrigin, manufacturingDate, expirationDate, items, rawText, warnings };
}

import type { AnalysisItem, ParsedCoa, ResolvedTemplateType } from "./types";

export function normalizeResult(value: string) {
  return /^compl(?:y|ies)$/i.test(value.trim()) ? "Conforms" : value.trim();
}

export function normalizeSpec(item: string, spec: string) {
  const clean = spec.trim().replace(/\s+/g, " ");
  if (/^(loss on drying|ash)$/i.test(item)) {
    const m = clean.match(/^[≤<]\s*([0-9.]+%)/);
    if (m) return `NMT${m[1]}`;
  }
  return clean;
}

export function displayItemName(item: string) {
  const key = item.toLowerCase().replace(/[().]/g, "").replace(/\s+/g, " ").trim();
  const aliases: Record<string, string> = {
    "mesh size": "Sieve Analysis",
    "sieve analysis": "Sieve Analysis",
    "total place count": "Total Plate count",
    "total plate count": "Total Plate count",
    "total yeast & mold": "Yeast & Mold",
    "yeast & mold": "Yeast & Mold",
    "e coli": "E. Coli.",
    "staphylococcus": "Staphylococcus aureus",
    "staphylococcus aureus": "Staphylococcus aureus",
    "arsenic as": "As",
    "lead pb": "Pb",
    "mercury hg": "Hg",
    "cadmium cd": "Cd",
    "heavy metals": "Heavy metals",
  };
  return aliases[key] ?? item.trim();
}

export function normalizeItem(item: AnalysisItem): AnalysisItem {
  const name = displayItemName(item.item);
  return {
    ...item,
    item: name,
    specification: normalizeSpec(name, item.specification),
    result: normalizeResult(item.result),
    testMethod: item.testMethod.trim(),
  };
}

export function resolveTemplate(parsed: ParsedCoa, projectTemplate: "auto" | ResolvedTemplateType): ResolvedTemplateType {
  if (projectTemplate !== "auto") return projectTemplate;
  const special = parsed.items.find((x) => x.section === "special")?.item.toLowerCase();
  if (special?.includes("ratio")) return "ratio";
  if (special?.includes("assay")) return "assay";
  if (/\b\d+(?:\.\d+)?\s*:\s*1\b/.test(parsed.productName)) return "ratio";
  if (/extract/i.test(parsed.productName) && /\d+(?:\.\d+)?%/.test(parsed.productName)) return "assay";
  return "powder";
}

export function formatDotDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function batchFromProject(prefix: string | null, sourceBatch: string, manufacturingDate: string) {
  if (!prefix || !manufacturingDate) return sourceBatch;
  return `${prefix}${manufacturingDate.replaceAll("-", "")}`;
}

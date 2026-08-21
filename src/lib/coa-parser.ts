import { extractText, extractTextItems, getDocumentProxy } from "unpdf";
import type { StructuredTextItem } from "unpdf";
import type { AnalysisItem, ParsedCoa } from "./types";
import { MAX_ANALYSIS_ROWS, MAX_EXTRACTED_TEXT_CHARS, MAX_PDF_PAGES } from "./upload-security";

type VisualLine = {
  text: string;
  chunks: string[];
};

async function releasePdfDocument(pdf: unknown) {
  const candidate = pdf as {
    destroy?: () => Promise<unknown> | unknown;
    cleanup?: () => Promise<unknown> | unknown;
  };

  try {
    if (typeof candidate.destroy === "function") {
      await candidate.destroy();
      return;
    }
    if (typeof candidate.cleanup === "function") {
      await candidate.cleanup();
    }
  } catch {
    // Cleanup must never turn a completed conversion into an API failure.
  }
}

function clean(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function norm(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[.:#]/g, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateToIso(value: string) {
  const v = clean(value);
  if (!v) return "";
  const iso = v.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = v.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${us[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const d = new Date(`${v} UTC`);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return v;
}

function visualLinesFromItems(pages: StructuredTextItem[][]): VisualLine[] {
  const output: VisualLine[] = [];
  let charCount = 0;

  for (const page of pages) {
    const sorted = [...page]
      .filter((item) => clean(item.str))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const rows: StructuredTextItem[][] = [];
    for (const item of sorted) {
      let row = rows.find((candidate) => Math.abs((candidate[0]?.y ?? 0) - item.y) <= 2.2);
      if (!row) {
        row = [];
        rows.push(row);
      }
      row.push(item);
    }

    rows.sort((a, b) => (b[0]?.y ?? 0) - (a[0]?.y ?? 0));

    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      const chunks: string[] = [];
      let current = "";
      let previousEnd = 0;
      let previousFontSize = 10;

      for (const item of row) {
        const gap = item.x - previousEnd;
        const wideGap = Boolean(current) && gap > Math.max(13, previousFontSize * 1.15, item.fontSize * 1.15);
        if (wideGap) {
          if (clean(current)) chunks.push(clean(current));
          current = item.str;
        } else {
          if (current) current += " ";
          current += item.str;
        }
        previousEnd = item.x + item.width;
        previousFontSize = item.fontSize;
      }

      if (clean(current)) chunks.push(clean(current));
      const text = chunks.join("    ");
      if (!clean(text)) continue;

      charCount += text.length + 1;
      if (charCount > MAX_EXTRACTED_TEXT_CHARS) {
        throw new Error("PDF contains too much extractable text.");
      }
      output.push({ text, chunks });
    }

    output.push({ text: "", chunks: [] });
  }

  return output;
}

const fieldAliases = {
  productName: [
    "Product Name", "Product", "Material Name", "Material", "Ingredient Name", "Ingredient",
    "Sample Name", "Item Name", "Description",
  ],
  botanicalSource: [
    "Botanical Source", "Botanical Name", "Latin Name", "Scientific Name", "Botanical",
  ],
  batchNumber: [
    "Batch Number", "Batch No", "Batch No.", "Batch #", "Lot Number", "Lot No", "Lot No.", "Lot #", "Lot",
  ],
  partUsed: ["Part Used", "Plant Part", "Used Part", "Part of Plant"],
  countryOfOrigin: ["Country of Origin", "Origin Country", "Country", "Origin"],
  manufacturingDate: [
    "Production Date", "Manufacturing Date", "Manufacture Date", "Date of Manufacture", "MFG Date", "Mfg Date",
  ],
  expirationDate: [
    "Expiration Date", "Expiry Date", "Expire Date", "EXP Date", "Exp Date", "Best Before", "Retest Date",
  ],
} as const;

type FieldKey = keyof typeof fieldAliases;

const allFieldAliases = Object.values(fieldAliases).flat();
const allFieldAliasNorms = new Set(allFieldAliases.map(norm));

function fieldValueFromVisualLines(lines: VisualLine[], key: FieldKey) {
  const aliases = fieldAliases[key];
  const aliasesNorm = aliases.map(norm);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.text) continue;

    // Most supplier PDFs render labels and values as separate positioned chunks.
    for (let chunkIndex = 0; chunkIndex < line.chunks.length; chunkIndex += 1) {
      const chunk = line.chunks[chunkIndex];
      const chunkNorm = norm(chunk);
      const aliasIndex = aliasesNorm.findIndex((alias) => chunkNorm === alias || chunkNorm.startsWith(`${alias} `));
      if (aliasIndex < 0) continue;

      const alias = aliases[aliasIndex];
      if (chunkNorm.startsWith(`${norm(alias)} `)) {
        const sameChunk = clean(chunk.slice(alias.length).replace(/^\s*[:#-]\s*/, ""));
        if (sameChunk) return sameChunk;
      }

      const nextChunk = line.chunks[chunkIndex + 1];
      if (nextChunk && !allFieldAliasNorms.has(norm(nextChunk))) return clean(nextChunk);

      const nextLine = lines.slice(lineIndex + 1).find((candidate) => candidate.text);
      if (nextLine && nextLine.chunks.length === 1 && !allFieldAliasNorms.has(norm(nextLine.chunks[0]))) {
        return clean(nextLine.chunks[0]);
      }
    }

    // Handle flattened text such as "Batch No: ABC123".
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = line.text.match(new RegExp(`(?:^|\\s)${escaped}\\s*[:#-]?\\s*(.+)$`, "i"));
      if (match?.[1]) {
        let value = clean(match[1]);
        // Stop before another metadata label on the same visual line.
        for (const stop of allFieldAliases) {
          if (norm(stop) === norm(alias)) continue;
          const pos = norm(value).indexOf(norm(stop));
          if (pos > 0) value = clean(value.slice(0, pos));
        }
        if (value) return value;
      }
    }
  }

  return "";
}

function isSectionHeading(value: string) {
  return /^(chemical\/?physical(?: control)?|analytical data|analysis|items? of analysis|microbiolog(?:y|ical)(?: control| test)?|additional information|packing(?: and| &) storage|storage|specifications?)$/i.test(clean(value));
}

function isColumnHeader(value: string) {
  const n = norm(value);
  return /^(items? of analysis|analysis|test|parameter|characteristic|item|specification|specifications|standard|requirement|result|results|test method|method|method of analysis)$/.test(n);
}

function isMetadataLabel(value: string) {
  const n = norm(value);
  return allFieldAliases.some((alias) => n === norm(alias) || n.startsWith(`${norm(alias)} `));
}

function looksLikeMethod(value: string) {
  const v = clean(value);
  if (!v) return false;
  return /(?:\bUSP\s*<?\d+>?|\bAOAC\b|\bAOCS\b|\bASTM\b|\bFCC\b|\bEP\b|Ph\.?\s*Eur\.?|\bBP\b|\bJP\b|\bCP\b|\bGB\/?T?\b|\bHPLC\b|\bUPLC\b|\bGC(?:-MS)?\b|\bICP(?:-MS|-OES)?\b|\bAAS\b|\bTLC\b|\bUV(?:-Vis)?\b|\bPCR\b|\bELISA\b|\bVisual\b|\bOrganoleptic\b|\bGravimetric\b|\bTitration\b|\bSieve\b|\bScreen\b|\bPlate Count\b|\bIn-house\b|\bInternal Method\b)/i.test(v);
}

function looksLikeSpec(value: string) {
  const v = clean(value);
  if (!v) return false;
  return /^(?:NMT|NLT|Not more than|Not less than|Min(?:imum)?\.?|Max(?:imum)?\.?|Meets? (?:the )?requirements?|Conforms? to|Complies? with|Positive|Negative|Absent|Pass|≤|≥|<|>)/i.test(v)
    || /(?:\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?\s*(?:%|ppm|ppb|cfu\/?g|g\/?100mL|mesh|mg\/?g|mg\/?kg)?)/i.test(v)
    || /(?:\d+(?:\.\d+)?\s*:\s*1)/.test(v)
    || /(?:through\s+\d+\s*mesh)/i.test(v);
}

function looksLikeResult(value: string) {
  const v = clean(value);
  if (!v) return false;
  if (/^(?:Complies?|Conforms?|Pass(?:ed)?|Fail(?:ed)?|Positive|Negative|Absent|Present|Not detected|ND|N\/D|Meets? requirements?)$/i.test(v)) return true;
  if (/^[<>≤≥]?\s*[\d,.]+(?:\s*(?:-|–|to)\s*[\d,.]+)?\s*(?:%|ppm|ppb|cfu\/?g|cfu\/?ml|g\/?100mL|mg\/?g|mg\/?kg|mesh|°C|degC|mL|g|mg|µg|ug)?$/i.test(v)) return true;
  if (/^\d+(?:\.\d+)?\s*:\s*1$/.test(v)) return true;
  return false;
}

const commonItemNames = [
  "Identification", "Appearance", "Color", "Colour", "Odor", "Odour", "Taste", "Bulk Density",
  "Tapped Density", "Particle Size", "Mesh Size", "Sieve Analysis", "Ash", "Total Ash", "Acid Insoluble Ash",
  "Loss on Drying", "Loss on drying", "Moisture", "Water", "pH", "Assay", "Ratio", "Extract Ratio",
  "Heavy Metals", "Heavy Metal", "Arsenic", "Arsenic (As)", "Lead", "Lead (Pb)", "Mercury", "Mercury (Hg)",
  "Cadmium", "Cadmium (Cd)", "Pesticide Residue", "Pesticides Residue", "Pesticides", "Residual Solvents",
  "Total Plate Count", "Total Aerobic Count", "Aerobic Plate Count", "Total Bacterial Count", "Yeast & Mold",
  "Total Yeast & Mold", "E. Coli", "E. Coli.", "Escherichia coli", "Salmonella", "Staphylococcus",
  "Staphylococcus aureus", "Coliform", "Enterobacteriaceae", "Aflatoxin", "Aflatoxins", "Ochratoxin A",
  "Gluten", "Allergens", "GMO", "Irradiation", "Melamine", "Sulfur Dioxide", "SO2",
];

function splitItemAndSpec(value: string): [string, string] | null {
  const v = clean(value);
  if (!v) return null;

  // Prefer semantic item labels when present, but do not require them.
  const known = commonItemNames
    .sort((a, b) => b.length - a.length)
    .find((name) => v.toLowerCase().startsWith(name.toLowerCase()));
  if (known) {
    const rest = clean(v.slice(known.length));
    if (rest) return [known, rest];
  }

  const specStart = v.search(/\s(?=(?:NMT|NLT|Not more than|Not less than|Min(?:imum)?\.?|Max(?:imum)?\.?|Meets? (?:the )?requirements?|Conforms? to|Complies? with|Positive\b|Negative\b|Absent\b|≤|≥|<\s*\d|>\s*\d|\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d|\d+(?:\.\d+)?\s*:\s*1|\d+(?:\.\d+)?\s*(?:%|ppm|ppb|cfu\/?g|g\/?100mL|mg\/?g|mg\/?kg|mesh)\b))/i);
  if (specStart > 0) {
    return [clean(v.slice(0, specStart)), clean(v.slice(specStart))];
  }

  return null;
}

function trailingMethod(value: string): { body: string; method: string } | null {
  const v = clean(value);
  if (!v) return null;

  const patterns = [
    /\s((?:USP\s*<[^>]+>|USP\s*\d+)(?:\s*Method\s*[A-Z0-9]+)?\s*)$/i,
    /\s((?:AOAC|AOCS|ASTM|FCC|EP|Ph\.?\s*Eur\.?|BP|JP|CP|GB\/?T?)(?:\s*[\w.<>()/-]+)*)$/i,
    /\s((?:HPLC|UPLC|GC(?:-MS)?|ICP(?:-MS|-OES)?|AAS|TLC|UV(?:-Vis)?|PCR|ELISA|Visual|Organoleptic|Gravimetric|Titration|Sieve|Screen|Plate Count|In-house|Internal Method)(?:\s+[A-Za-z0-9.<>()/-]+)*)$/i,
  ];

  for (const pattern of patterns) {
    const match = v.match(pattern);
    if (match?.index != null) {
      return { body: clean(v.slice(0, match.index)), method: clean(match[1]) };
    }
  }
  return null;
}

function trailingResult(value: string): { body: string; result: string } | null {
  const v = clean(value);
  if (!v) return null;
  const match = v.match(/\s((?:Complies?|Conforms?|Pass(?:ed)?|Fail(?:ed)?|Positive|Negative|Absent|Present|Not detected|ND|N\/D|Meets? requirements?|[<>≤≥]?\s*[\d,.]+(?:\s*(?:-|–|to)\s*[\d,.]+)?\s*(?:%|ppm|ppb|cfu\/?g|cfu\/?ml|g\/?100mL|mg\/?g|mg\/?kg|mesh|°C|degC|mL|g|mg|µg|ug)?|\d+(?:\.\d+)?\s*:\s*1))$/i);
  if (!match?.[1] || match.index == null) return null;
  return { body: clean(v.slice(0, match.index)), result: clean(match[1]) };
}

function inferSection(item: string, current: AnalysisItem["section"]): AnalysisItem["section"] {
  if (/\b(assay|ratio|extract ratio)\b/i.test(item)) return "special";
  if (/\b(total (?:plate|aerobic|bacterial)|plate count|yeast|mold|e\.?\s*coli|escherichia|salmonella|staphylococcus|coliform|enterobacter|microb|pathogen)\b/i.test(item)) {
    return "microbiology";
  }
  return current;
}

function validItemName(value: string) {
  const v = clean(value);
  if (!v || v.length > 120) return false;
  if (isSectionHeading(v) || isColumnHeader(v) || isMetadataLabel(v)) return false;
  if (looksLikeMethod(v) || looksLikeSpec(v) || looksLikeResult(v)) return false;
  if (/^(certificate of analysis|coa|page \d+|prepared by|approved by|signature|date)$/i.test(v)) return false;
  return /[A-Za-z]/.test(v);
}

function rowFromChunks(chunks: string[], currentSection: AnalysisItem["section"]): AnalysisItem | null {
  const values = chunks.map(clean).filter(Boolean);
  if (values.length < 2) return null;
  if (values.every((value) => isColumnHeader(value))) return null;

  // A typical supplier COA has 3-5 visual columns, but their labels and widths differ.
  // We infer column meaning by content instead of requiring an exact table/header.
  const item = values[0];
  if (!validItemName(item)) return null;

  if (values.length >= 4) {
    const methodIndex = values.findIndex((value, index) => index >= 2 && looksLikeMethod(value));
    if (methodIndex >= 3) {
      const spec = values.slice(1, methodIndex - 1).join(" ");
      const result = values[methodIndex - 1];
      const method = values.slice(methodIndex).join(" ");
      if (spec && (looksLikeResult(result) || result.length <= 60)) {
        return { item, specification: spec, result, testMethod: method, section: inferSection(item, currentSection) };
      }
    }
    return {
      item,
      specification: values[1],
      result: values[2],
      testMethod: values.slice(3).join(" "),
      section: inferSection(item, currentSection),
    };
  }

  if (values.length === 3) {
    if (looksLikeMethod(values[2])) {
      return {
        item,
        specification: "",
        result: values[1],
        testMethod: values[2],
        section: inferSection(item, currentSection),
      };
    }
    return {
      item,
      specification: values[1],
      result: values[2],
      testMethod: "",
      section: inferSection(item, currentSection),
    };
  }

  return null;
}

function rowFromFlatText(text: string, currentSection: AnalysisItem["section"]): AnalysisItem | null {
  const line = clean(text);
  if (!line || isSectionHeading(line) || isColumnHeader(line) || isMetadataLabel(line)) return null;

  const method = trailingMethod(line);
  if (!method) return null;
  const result = trailingResult(method.body);
  if (!result) return null;
  const itemAndSpec = splitItemAndSpec(result.body);
  if (!itemAndSpec) return null;

  const [item, spec] = itemAndSpec;
  if (!validItemName(item)) return null;
  return {
    item,
    specification: spec,
    result: result.result,
    testMethod: method.method,
    section: inferSection(item, currentSection),
  };
}

function parseLabeledRow(text: string, currentSection: AnalysisItem["section"]): AnalysisItem | null {
  const line = clean(text);
  if (!line) return null;

  // Supplier formats sometimes use prose instead of a visible table:
  // "Test: Lead | Specification: NMT 2 ppm | Result: 0.3 ppm | Method: ICP-MS"
  const item = line.match(/(?:^|\b)(?:Test|Item|Parameter|Characteristic)\s*[:=-]\s*([^|;]+?)(?=\s+(?:Specification|Spec|Requirement|Result|Method)\s*[:=-]|[|;]|$)/i)?.[1];
  const spec = line.match(/\b(?:Specification|Spec|Requirement|Standard)\s*[:=-]\s*([^|;]+?)(?=\s+(?:Result|Method)\s*[:=-]|[|;]|$)/i)?.[1];
  const result = line.match(/\bResult\s*[:=-]\s*([^|;]+?)(?=\s+Method\s*[:=-]|[|;]|$)/i)?.[1];
  const method = line.match(/\b(?:Test Method|Method)\s*[:=-]\s*([^|;]+?)(?:[|;]|$)/i)?.[1];

  if (!item || (!spec && !result)) return null;
  if (!validItemName(item)) return null;
  return {
    item: clean(item),
    specification: clean(spec || ""),
    result: clean(result || ""),
    testMethod: clean(method || ""),
    section: inferSection(item, currentSection),
  };
}

function parseFlexibleAnalysis(lines: VisualLine[]): AnalysisItem[] {
  const items: AnalysisItem[] = [];
  const seen = new Set<string>();
  let section: AnalysisItem["section"] = "chemical";
  let pendingItem: string | null = null;
  let pendingSpec = "";
  let pendingResult = "";

  const push = (row: AnalysisItem | null) => {
    if (!row) return;
    const cleaned: AnalysisItem = {
      item: clean(row.item),
      specification: clean(row.specification),
      result: clean(row.result),
      testMethod: clean(row.testMethod),
      section: row.section,
    };
    if (!validItemName(cleaned.item)) return;
    if (!cleaned.specification && !cleaned.result) return;
    const key = `${norm(cleaned.item)}|${norm(cleaned.specification)}|${norm(cleaned.result)}|${norm(cleaned.testMethod)}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(cleaned);
  };

  for (const visualLine of lines) {
    const text = clean(visualLine.text);
    if (!text) continue;

    if (/microbiolog/i.test(text)) {
      section = "microbiology";
      pendingItem = null;
      pendingSpec = "";
      pendingResult = "";
      continue;
    }
    if (/chemical\/?physical|analytical data/i.test(text)) {
      section = "chemical";
      pendingItem = null;
      pendingSpec = "";
      pendingResult = "";
      continue;
    }
    if (/additional information|packing(?: and| &) storage/i.test(text)) {
      pendingItem = null;
      pendingSpec = "";
      pendingResult = "";
      continue;
    }
    if (isColumnHeader(text) || visualLine.chunks.every((chunk) => isColumnHeader(chunk))) continue;

    const labeled = parseLabeledRow(text, section);
    if (labeled) {
      push(labeled);
      pendingItem = null;
      pendingSpec = "";
      pendingResult = "";
      if (items.length >= MAX_ANALYSIS_ROWS) break;
      continue;
    }

    const visual = rowFromChunks(visualLine.chunks, section);
    if (visual) {
      push(visual);
      pendingItem = null;
      pendingSpec = "";
      pendingResult = "";
      if (items.length >= MAX_ANALYSIS_ROWS) break;
      continue;
    }

    const flat = rowFromFlatText(text, section);
    if (flat) {
      push(flat);
      pendingItem = null;
      pendingSpec = "";
      pendingResult = "";
      if (items.length >= MAX_ANALYSIS_ROWS) break;
      continue;
    }

    // Support vertical / card-style supplier layouts where the four fields are
    // placed on consecutive lines rather than a conventional table.
    if (pendingItem) {
      if (!pendingSpec && (looksLikeSpec(text) || (!looksLikeMethod(text) && !looksLikeResult(text) && text.length <= 100))) {
        pendingSpec = text;
        continue;
      }
      if (!pendingResult && looksLikeResult(text)) {
        pendingResult = text;
        continue;
      }
      if (looksLikeMethod(text) && (pendingSpec || pendingResult)) {
        push({
          item: pendingItem,
          specification: pendingSpec,
          result: pendingResult,
          testMethod: text,
          section: inferSection(pendingItem, section),
        });
        pendingItem = null;
        pendingSpec = "";
        pendingResult = "";
        if (items.length >= MAX_ANALYSIS_ROWS) break;
        continue;
      }
    }

    if (visualLine.chunks.length === 2 && validItemName(visualLine.chunks[0])) {
      const second = visualLine.chunks[1];
      if (looksLikeResult(second)) {
        push({
          item: visualLine.chunks[0],
          specification: "",
          result: second,
          testMethod: "",
          section: inferSection(visualLine.chunks[0], section),
        });
        if (items.length >= MAX_ANALYSIS_ROWS) break;
        continue;
      }
      pendingItem = visualLine.chunks[0];
      pendingSpec = second;
      pendingResult = "";
      continue;
    }

    if (visualLine.chunks.length === 1 && validItemName(text) && text.length <= 80) {
      pendingItem = text;
      pendingSpec = "";
      pendingResult = "";
    }
  }

  return items;
}


function extractAdditionalInfo(lines: VisualLine[]) {
  let packingAndStorage = "";
  let storageInstructions = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const text = clean(line.text);
    if (!text) continue;

    const labelMatch = text.match(/^(?:Packing(?:\s*(?:and|&)\s*)Storage|Packaging(?:\s*(?:and|&)\s*)Storage|Packing)\s*[:#-]?\s*(.*)$/i);
    if (labelMatch) {
      packingAndStorage = clean(labelMatch[1] || "");
      if (!packingAndStorage && line.chunks.length > 1) {
        packingAndStorage = clean(line.chunks.slice(1).join(" "));
      }

      for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
        const next = clean(lines[j].text);
        if (!next) continue;
        if (/^(?:Shelf Life|Certificate|Prepared|Approved|Page\s+\d+)/i.test(next)) break;
        if (/^(?:Store|Storage|Keep|Preserve)\b/i.test(next)) {
          storageInstructions = next.replace(/^Storage\s*[:#-]?\s*/i, "");
          break;
        }
        if (!packingAndStorage && next.length < 260) {
          packingAndStorage = next;
        } else if (!storageInstructions && next.length < 260) {
          storageInstructions = next;
          break;
        }
      }
      break;
    }
  }

  if (!storageInstructions) {
    const storageLine = lines.find((line) => /^(?:Store|Storage|Keep|Preserve)\b/i.test(clean(line.text)));
    if (storageLine) storageInstructions = clean(storageLine.text).replace(/^Storage\s*[:#-]?\s*/i, "");
  }

  return { packingAndStorage, storageInstructions };
}

function fallbackLinesFromText(rawText: string): VisualLine[] {
  return rawText.split(/\r?\n/).map((line) => {
    const chunks = line.split(/\t|\s{2,}/).map(clean).filter(Boolean);
    return { text: clean(line), chunks: chunks.length ? chunks : clean(line) ? [clean(line)] : [] };
  });
}

export async function parseCoaPdf(pdfBytes: Uint8Array): Promise<ParsedCoa> {
  const pdf = await getDocumentProxy(pdfBytes);
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF has too many pages. Maximum is ${MAX_PDF_PAGES}.`);
    }

    const structured = await extractTextItems(pdf);
    let visualLines = visualLinesFromItems(structured.items);
    let rawText = visualLines.map((line) => line.text).join("\n").trim();

    // Some PDFs expose text without reliable coordinates. Fall back to merged
    // extraction, then run the same schema-independent parser on those lines.
    if (rawText.length < 30) {
      const merged = await extractText(pdf, { mergePages: true });
      const mergedText: unknown = merged.text;
      rawText = Array.isArray(mergedText)
        ? mergedText.map((value) => String(value)).join("\n")
        : typeof mergedText === "string"
          ? mergedText
          : mergedText == null
            ? ""
            : String(mergedText);
      visualLines = fallbackLinesFromText(rawText);
    }

    if (rawText.length > MAX_EXTRACTED_TEXT_CHARS) {
      throw new Error("PDF contains too much extractable text.");
    }

    const productName = fieldValueFromVisualLines(visualLines, "productName");
    const botanicalSource = fieldValueFromVisualLines(visualLines, "botanicalSource");
    const batchNumber = fieldValueFromVisualLines(visualLines, "batchNumber");
    const partUsed = fieldValueFromVisualLines(visualLines, "partUsed");
    const countryOfOrigin = fieldValueFromVisualLines(visualLines, "countryOfOrigin");
    const manufacturingDate = dateToIso(fieldValueFromVisualLines(visualLines, "manufacturingDate"));
    const expirationDate = dateToIso(fieldValueFromVisualLines(visualLines, "expirationDate"));
    const items = parseFlexibleAnalysis(visualLines);
    const { packingAndStorage, storageInstructions } = extractAdditionalInfo(visualLines);

    const warnings: string[] = [];
    if (!productName) warnings.push("Product name was not detected automatically.");
    if (!batchNumber) warnings.push("Batch / lot number was not detected automatically.");
    if (!manufacturingDate) warnings.push("Manufacturing / production date was not detected automatically.");
    if (!items.length) {
      if (rawText.replace(/\s+/g, " ").trim().length < 40) {
        warnings.push("The PDF contains little or no extractable text and may be image-only. OCR is required for scanned COAs.");
      } else {
        warnings.push("The PDF text was extracted, but no COA analysis fields could be mapped with sufficient confidence.");
      }
    }

    return {
      productName,
      botanicalSource,
      partUsed,
      batchNumber,
      countryOfOrigin,
      manufacturingDate,
      expirationDate,
      packingAndStorage,
      storageInstructions,
      items,
      rawText,
      warnings,
    };
  } finally {
    await releasePdfDocument(pdf);
  }
}

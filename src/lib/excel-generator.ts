import ExcelJS from "exceljs";
import { TEMPLATE_BASE64 } from "./template-data";
import { batchFromProject, formatDotDate, normalizeItem } from "./coa-normalizer";
import type { ParsedCoa, Project, ResolvedTemplateType } from "./types";

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

function findRow(ws: ExcelJS.Worksheet, label: string) {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (String(ws.getCell(`A${r}`).value ?? "").trim().toLowerCase() === label.toLowerCase()) return r;
  }
  throw new Error(`Template row not found: ${label}`);
}

function styleSnapshot(ws: ExcelJS.Worksheet, rowNumber: number) {
  const row = ws.getRow(rowNumber);
  return {
    height: row.height,
    cells: Array.from({ length: 6 }, (_, i) => clone(ws.getCell(rowNumber, i + 1).style)),
  };
}

function applyStyle(ws: ExcelJS.Worksheet, rowNumber: number, snap: ReturnType<typeof styleSnapshot>) {
  const row = ws.getRow(rowNumber);
  row.height = snap.height;
  for (let c = 1; c <= 6; c++) ws.getCell(rowNumber, c).style = clone(snap.cells[c - 1]);
}

function writeAnalysisRows(ws: ExcelJS.Worksheet, parsed: ParsedCoa) {
  const packingBefore = findRow(ws, "Packing and Storage");
  try { ws.unMergeCells(`C${packingBefore}:F${packingBefore}`); } catch {}
  try { ws.unMergeCells(`C${packingBefore + 1}:F${packingBefore + 1}`); } catch {}
  const analyticalRow = findRow(ws, "Analytical Data");
  const microRowBefore = findRow(ws, "Microbiological Test");
  const additionalRowBefore = findRow(ws, "Additional information");
  const chemicalStyle = styleSnapshot(ws, analyticalRow + 1);
  const microStyle = styleSnapshot(ws, microRowBefore + 1);

  const oldChemicalCount = microRowBefore - analyticalRow - 1;
  const oldMicroCount = additionalRowBefore - microRowBefore - 2; // leaves spacer row before Additional information
  if (oldMicroCount > 0) ws.spliceRows(microRowBefore + 1, oldMicroCount);
  if (oldChemicalCount > 0) ws.spliceRows(analyticalRow + 1, oldChemicalCount);

  const chemical = parsed.items.filter((x) => x.section === "chemical").map(normalizeItem);
  const microbiology = parsed.items.filter((x) => x.section === "microbiology").map(normalizeItem);

  let microHeaderRow = findRow(ws, "Microbiological Test");
  if (chemical.length) {
    ws.spliceRows(microHeaderRow, 0, ...chemical.map(() => [null, null, null, null, null, null]));
    chemical.forEach((item, i) => {
      const r = microHeaderRow + i;
      applyStyle(ws, r, chemicalStyle);
      ws.getCell(`A${r}`).value = item.item;
      ws.getCell(`C${r}`).value = item.specification;
      ws.getCell(`E${r}`).value = item.result;
      ws.getCell(`F${r}`).value = item.testMethod;
    });
  }

  microHeaderRow = findRow(ws, "Microbiological Test");
  if (microbiology.length) {
    ws.spliceRows(microHeaderRow + 1, 0, ...microbiology.map(() => [null, null, null, null, null, null]));
    microbiology.forEach((item, i) => {
      const r = microHeaderRow + 1 + i;
      applyStyle(ws, r, microStyle);
      ws.getCell(`A${r}`).value = item.item;
      ws.getCell(`C${r}`).value = item.specification;
      ws.getCell(`E${r}`).value = item.result;
      ws.getCell(`F${r}`).value = item.testMethod;
    });
  }
  const packingAfter = findRow(ws, "Packing and Storage");
  ws.mergeCells(`C${packingAfter}:F${packingAfter}`);
  ws.mergeCells(`C${packingAfter + 1}:F${packingAfter + 1}`);
}

export async function generateExcel(parsed: ParsedCoa, project: Project, type: ResolvedTemplateType) {
  const workbook = new ExcelJS.Workbook();
  const nodeBuffer = Buffer.from(TEMPLATE_BASE64[type], "base64");
  // ExcelJS 4.x types load() as ArrayBuffer. Node's Buffer is a Uint8Array
  // view, so pass the exact underlying byte range as a real ArrayBuffer.
  const templateBuffer = nodeBuffer.buffer.slice(
    nodeBuffer.byteOffset,
    nodeBuffer.byteOffset + nodeBuffer.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(templateBuffer);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("Template workbook has no worksheet.");

  const outputProduct = project.output_product_name?.trim() || parsed.productName;
  const outputBatch = batchFromProject(project.batch_prefix, parsed.batchNumber, parsed.manufacturingDate);
  ws.getCell("C4").value = outputProduct;
  ws.getCell("C5").value = parsed.botanicalSource;
  ws.getCell("F5").value = parsed.partUsed;
  ws.getCell("C6").value = outputBatch;
  ws.getCell("F6").value = parsed.countryOfOrigin;
  ws.getCell("C7").value = formatDotDate(parsed.manufacturingDate);
  ws.getCell("F7").value = formatDotDate(parsed.expirationDate);

  if (type === "assay" || type === "ratio") {
    const special = parsed.items.find((x) => x.section === "special" || x.item.toLowerCase() === type);
    const row = 10;
    ws.getCell(`A${row}`).value = type === "assay" ? "Assay" : "Ratio";
    ws.getCell(`C${row}`).value = special?.specification ?? "";
    ws.getCell(`E${row}`).value = special ? normalizeItem(special).result : "";
    ws.getCell(`F${row}`).value = special?.testMethod ?? "";
  }

  writeAnalysisRows(ws, parsed);
  workbook.creator = "COA Converter";
  workbook.lastModifiedBy = "COA Converter";
  const out = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(out), outputProduct, outputBatch };
}

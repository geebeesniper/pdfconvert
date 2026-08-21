import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCoaPdf } from "../src/lib/coa-parser";
import { generateExcel } from "../src/lib/excel-generator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Smoke test failed: ${message}`);
}

const root = process.cwd();
const pdf = await readFile(path.join(root, "public/samples/source-chasteberry.pdf"));
const parsed = await parseCoaPdf(new Uint8Array(pdf));

assert(parsed.productName === "Chaste Berry Powder", `unexpected product: ${parsed.productName}`);
assert(parsed.batchNumber === "CT2603184", `unexpected source batch: ${parsed.batchNumber}`);
assert(parsed.manufacturingDate === "2025-03-14", `unexpected manufacturing date: ${parsed.manufacturingDate}`);
assert(parsed.items.length >= 20, `expected at least 20 analysis items, got ${parsed.items.length}`);

console.log("Parsed header:", {
  product: parsed.productName,
  batch: parsed.batchNumber,
  date: parsed.manufacturingDate,
  items: parsed.items.length,
  warnings: parsed.warnings,
});

const result = await generateExcel(parsed, "powder");
assert(result.outputProduct === "Chaste Berry Powder", `unexpected output product: ${result.outputProduct}`);
assert(result.outputBatch === "CT2603184", `unexpected output batch: ${result.outputBatch}`);
assert(parsed.packingAndStorage.includes("25kg"), `packing/storage not detected: ${parsed.packingAndStorage}`);

const outDir = path.join(root, "smoke-output");
await mkdir(outDir, { recursive: true });
const out = path.join(outDir, "converted-chasteberry.xlsx");
await writeFile(out, result.buffer);
console.log("Wrote", out, "bytes", result.buffer.length, "product", result.outputProduct, "batch", result.outputBatch);

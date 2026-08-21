import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCoaPdf } from "../src/lib/coa-parser";
import { generateExcel } from "../src/lib/excel-generator";
import type { Project } from "../src/lib/types";

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

const project: Project = {
  id: "smoke",
  name: "Organic Chasteberry Powder",
  description: null,
  default_template: "powder",
  output_product_name: "Organic Chasteberry Powder",
  batch_prefix: "OCP",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const result = await generateExcel(parsed, project, "powder");
assert(result.outputProduct === "Organic Chasteberry Powder", "project product override failed");
assert(result.outputBatch === "OCP20250314", `unexpected output batch: ${result.outputBatch}`);

const outDir = path.join(root, "smoke-output");
await mkdir(outDir, { recursive: true });
const out = path.join(outDir, "converted-chasteberry.xlsx");
await writeFile(out, result.buffer);
console.log("Wrote", out, "bytes", result.buffer.length, "product", result.outputProduct, "batch", result.outputBatch);

export type TemplateType = "auto" | "powder" | "assay" | "ratio";
export type ResolvedTemplateType = Exclude<TemplateType, "auto">;
export type ConversionStatus = "processing" | "ready" | "error";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  default_template: TemplateType;
  output_product_name: string | null;
  batch_prefix: string | null;
  created_at: string;
  updated_at: string;
  conversion_count?: number;
  ready_count?: number;
  error_count?: number;
  last_conversion_at?: string | null;
}

export interface Conversion {
  id: string;
  project_id: string;
  source_file_name: string;
  source_storage_path: string;
  output_file_name: string | null;
  output_storage_path: string | null;
  template_type: ResolvedTemplateType | null;
  status: ConversionStatus;
  product_name: string | null;
  batch_number: string | null;
  manufacturing_date: string | null;
  extracted_data: ParsedCoa | null;
  warning_count: number;
  error_message: string | null;
  created_at: string;
}

export interface AnalysisItem {
  item: string;
  specification: string;
  result: string;
  testMethod: string;
  section: "chemical" | "microbiology" | "special";
}

export interface ParsedCoa {
  productName: string;
  botanicalSource: string;
  partUsed: string;
  batchNumber: string;
  countryOfOrigin: string;
  manufacturingDate: string;
  expirationDate: string;
  items: AnalysisItem[];
  rawText: string;
  warnings: string[];
}

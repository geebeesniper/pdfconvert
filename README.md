# COA Converter — Fixed Template v6.1

Vercel + Supabase SaaS workflow for converting supplier COA PDFs into the fixed **Key In COA** Excel format.

## What this version does

- The supplier PDF may use a different layout, column order, labels, or visual table design.
- The output is always the supplied Key In COA workbook format.
- Workbook branding, headings, and fixed labels remain unchanged.
- Supplier values are mapped into the fixed cells:
  - Product Name
  - Botanical Source
  - Part Used
  - Batch Number / Lot
  - Country of Origin
  - Manufacturing / Production Date
  - Expiration / Expiry Date
  - Items of Analysis / Specification / Result / Test Method
  - Microbiological Test
  - Packing and Storage
- Assay/Ratio PDFs automatically use the matching supplied Key In COA variant while keeping the same overall format.
- Source PDFs remain private in Supabase Storage and can be opened/downloaded from History through short-lived signed URLs.
- History supports Excel download and delete.
- Upload validation, PDF signature checks, page/size/text limits, and timeouts remain enabled.

## Important

This converter maps **text-based PDFs** regardless of supplier layout. A PDF that contains only scanned images has no text layer and requires an OCR stage before mapping.

## Supabase / Vercel

Existing v5.x Supabase tables and buckets are compatible. No schema reset is required.

Environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Dashboard

There is no Project Grid and no login page. The root page is:

1. Upload / drop PDF
2. Live conversion stages
3. All History below

The internal workspace project exists only as a database grouping key and is not shown in the UI.

## v6.2 compatibility fix

This package intentionally includes harmless compatibility files for the old
`/api/projects`, `/projects`, and `/login` paths. They overwrite stale files
that can remain when a newer release is copied over an older Git checkout.
The active application remains the flat dashboard: upload at the top, all
conversion history below, fixed Key In COA Excel output.

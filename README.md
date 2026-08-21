# COA Converter — Vercel + Supabase

A project-based Certificate of Analysis converter built for the supplied Key-In Nutrition Excel formats.

## What is included

- Hardcoded server-side admin login for the demo
- Project dashboard in a responsive grid
- Every conversion stored **by project**
- Conversion history grid with status, template, product, batch, warnings and download
- Supabase private Storage for source PDFs and generated Excel files
- Supabase PostgreSQL history + project settings
- Secure signed browser upload, so the PDF does not have to pass through a Vercel multipart upload endpoint
- Native-text PDF extraction with `unpdf`
- Automatic Powder / Assay / Ratio selection (or force a template per project)
- Dynamic analysis rows: the output is not limited to the sample rows already present in the Excel template
- Key-In normalization rules such as `Complies → Conforms`, source date → `YYYY.MM.DD`, and optional internal batch prefix + manufacturing date
- Original Powder / Assay / Ratio `.xlsx` templates are embedded and also kept in `public/templates/`

## Demo login

**Email:** `admin@keyin.local`  
**Password:** `K1N!COA#2026@Vercel$Sup4base^9Qz`

This is intentionally hardcoded because the current request is for a private demo. The password is checked only on the server and the browser receives an HttpOnly signed session cookie. Replace this with Supabase Auth or another identity provider before exposing the site publicly.

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Set:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Do **not** expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

The SQL creates:

- `projects`
- `conversions`
- `project_dashboard` view
- private `coa-sources` Storage bucket
- private `coa-outputs` Storage bucket
- a seeded Organic Chasteberry Powder project using `OCP + YYYYMMDD` as the output batch rule

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with the demo login above.

## Core conversion smoke test

This does not need Supabase. It parses the supplied Lipond Chaste Berry PDF and creates a Key-In-style Excel file from the supplied Powder template:

```bash
npm run smoke
```

Output:

```text
smoke-output/converted-chasteberry.xlsx
```

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Add the three Supabase environment variables.
4. Deploy.

The upload flow is:

```text
Browser → signed Supabase Storage upload
        → Vercel conversion API
        → PDF extraction + normalization
        → selected Excel template
        → Supabase output Storage
        → conversion history row
```

## Current parser boundary

The included parser handles text-based COAs like the supplied Lipond sample. Scanned/image-only PDFs will be recorded as an error or warning until an OCR fallback is added. The code is structured so OCR can be added inside `src/lib/coa-parser.ts` without changing the project/history or Excel pipeline.

## Project creation UX
The Projects screen now starts with a `+ New project` grid card. Clicking it opens the PDF picker immediately. After a PDF is selected, the only required input is the project name; the app creates the project with automatic template detection, uploads the PDF, converts it, and opens the project history.

If your Supabase database was initialized with the first demo schema and you want to remove the seeded Chasteberry sample card, run `supabase/remove-demo-project.sql` once in the Supabase SQL Editor.

# COA Converter — Vercel + Supabase

Project-based Certificate of Analysis converter for the supplied Key-In Nutrition Excel formats.

## Current UI

- No login/password screen
- `/projects` is the dashboard
- Responsive Project grid
- First card is `+ New project`
- Click `+` → choose a PDF → enter only the project name → create + convert
- Every conversion/history record stays inside its project
- History cards include Download and inline Delete / Delete now

## Upload safety hardening

This version is intentionally strict so a bad upload is rejected instead of being allowed to consume unbounded memory/CPU:

- PDF only
- Maximum source PDF size: **5 MB**
- Maximum PDF pages processed: **5**
- Maximum extracted text retained: **200,000 characters**
- Maximum parsed analysis rows: **120**
- Browser validates extension, MIME (when available), size and `%PDF-` signature
- Vercel validates the upload request again
- Supabase Storage independently enforces PDF MIME type + 5 MB bucket limit
- Conversion validates that the Storage object belongs to the selected project
- Storage metadata is checked before the PDF is loaded into conversion memory
- PDF signature is checked again after download
- Duplicate conversion requests for the same Storage object are refused
- PDF parsing and Excel generation have execution time limits
- Malformed/unsupported PDFs are recorded as an Error instead of crashing the project history
- Source and output Storage buckets remain private
- `service_role` / secret key stays server-side only
- RLS remains enabled; `anon` and `authenticated` do not get direct project/history table access
- Basic security response headers are enabled

No internet-facing application can be guaranteed impossible to crash or hack. These controls are specifically intended to make malformed, renamed, oversized or pathological uploads fail closed and limit the impact to an individual serverless request rather than the whole site.

## Important access-control note

Authentication is intentionally disabled because this build was requested with no password. That means anyone who can reach the production URL can use the application APIs. Upload hardening protects the conversion process, but **it is not a replacement for access control**. If the site will be publicly discoverable, enable Vercel Deployment Protection / Firewall or restore application authentication later.

## Existing Supabase project — run this once

If your `pdfconvertor` Supabase project is already set up, run:

```text
supabase/security-hardening.sql
```

in **Supabase → SQL Editor**.

It does not delete projects/history/files. It updates the existing private buckets with hard file-size and MIME restrictions and re-applies the intended RLS/table grants.

## Fresh Supabase setup

For a brand-new database, run:

```text
supabase/schema.sql
```

It creates:

- `projects`
- `conversions`
- `project_dashboard`
- private `coa-sources`
- private `coa-outputs`
- RLS/grants
- Storage size/MIME limits

Environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_...` variable.

## Old login build error

This package intentionally includes compatibility files for:

```text
src/app/api/auth/login/route.ts
src/app/api/auth/logout/route.ts
src/app/login/page.tsx
```

so an older login route left in the Git checkout no longer imports `ADMIN_EMAIL`, `ADMIN_PASSWORD`, etc. `src/lib/auth.ts` also keeps legacy no-op exports as a second compatibility layer. Authentication remains disabled.

When updating GitHub, replace the project and commit **all changes including deleted/overwritten files** (`git add -A`).

## Vercel

Keep the existing Vercel configuration:

- Preset: Next.js
- Root: `./`
- existing three Supabase environment variables

Push to `main`; Vercel will redeploy automatically.

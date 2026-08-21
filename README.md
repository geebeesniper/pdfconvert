# pdfconvertor — flat dashboard v5.3

The production UI is intentionally flat:

1. Open `/`.
2. Drop or choose a COA PDF in the upload panel at the top.
3. Convert it to Excel.
4. See **all conversion history directly below the uploader**.
5. Download or delete individual history records.

There is no project grid and no project-detail navigation in the UI. The database still retains `project_id` internally for compatibility. New uploads are attached to one hidden `COA Workspace`; old conversion history from prior projects is still shown in the single History section.

## Existing Supabase project

No destructive migration is required. The app creates the hidden workspace automatically. Optionally run:

`supabase/flat-dashboard-workspace.sql`

The existing upload hardening, private Storage buckets, PDF validation, size limits and conversion error handling remain unchanged.

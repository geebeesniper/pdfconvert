# PDFConvertor — SaaS workflow v5.5

This build keeps the flat dashboard requested for production:

1. Drop/select a COA PDF at the top.
2. Click **Export to Excel**.
3. A live SaaS-style task card immediately shows the current stage and progress:
   - Preparing upload
   - Uploading PDF
   - Verifying upload
   - Reading PDF
   - Parsing COA
   - Mapping fields
   - Building Excel
   - Saving output
   - Excel ready / Error
4. History remains directly below the uploader and refreshes when the task completes.
5. Failed tasks report a visible error and the same selected PDF can be retried.

The conversion API streams newline-delimited JSON progress events, so the UI no longer sits silently while Vercel parses the PDF and generates Excel.

Security limits from v5.x remain in place: PDF validation, 5 MB upload cap, page/parse limits, private Supabase Storage, server-side validation, processing timeouts, and safe history deletion.

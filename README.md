# pdfconvertor v5.6

Flat SaaS dashboard: upload/convert at the top, all History below.

## v5.6 deletion fix

- History is now a client-managed list, so a successful DELETE removes the card immediately.
- The home dashboard is forced dynamic (`force-dynamic`, `revalidate = 0`) so reloads always read current Supabase rows instead of a stale prerendered result.
- DELETE now verifies that exactly one database row was actually deleted before reporting success.
- Existing upload hardening, progress workflow, private Storage and Excel generation remain unchanged.

No Supabase schema or environment-variable changes are required for this update.


## v5.7 supplier-independent COA parsing

The parser no longer requires one fixed supplier table or a fixed list of COA rows. It rebuilds visual text lines from PDF coordinates, detects common metadata labels with aliases, and infers test/specification/result/method fields from layout and value semantics. It supports multi-column tables, reduced-column layouts, labeled prose, and vertical/card-style COA fields. Image-only scanned PDFs still require OCR.

-- Run this once in Supabase SQL Editor for an EXISTING pdfconvertor project.
-- It does not delete projects, history, PDFs, or Excel files.

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf']::text[]
where id = 'coa-sources';

update storage.buckets
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
where id = 'coa-outputs';

alter table public.projects enable row level security;
alter table public.conversions enable row level security;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.conversions from anon, authenticated;
revoke all on table public.project_dashboard from anon, authenticated;

grant select, insert, update, delete on table public.projects to service_role;
grant select, insert, update, delete on table public.conversions to service_role;
grant select on table public.project_dashboard to service_role;

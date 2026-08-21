-- Optional cleanup for the sample project created by the first schema version.
-- Safe to run once. It only targets the fixed demo UUID.
delete from public.projects
where id = '11111111-1111-4111-8111-111111111111';

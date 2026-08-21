-- Safe to run on an existing database. No history is deleted or moved.
insert into public.projects (id,name,description,default_template,output_product_name,batch_prefix)
values (
  '22222222-2222-4222-8222-222222222222',
  'COA Workspace',
  'Internal workspace used by the flat COA dashboard.',
  'auto',
  null,
  null
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  default_template = 'auto',
  output_product_name = null,
  batch_prefix = null,
  updated_at = now();

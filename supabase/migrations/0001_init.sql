-- Health RAG Assistant, initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists vector;

-- One row per person being tracked (e.g. "Mom"). Supports more than one person later.
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  relation text, -- e.g. "Mother"
  date_of_birth date,
  created_at timestamptz not null default now()
);

-- One row per uploaded file, tagged to a person + the month it belongs to.
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  report_month date not null, -- normalized to the 1st of the month, e.g. 2026-08-01
  doc_type text check (doc_type in ('lab_report', 'doctor_note', 'imaging_report', 'vitals_log', 'other')),
  original_filename text not null,
  storage_path text not null, -- path within the Supabase Storage bucket
  raw_text text, -- full extracted text, filled in after parsing
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed')),
  parse_error text,
  uploaded_at timestamptz not null default now()
);

create index if not exists documents_person_month_idx on documents (person_id, report_month);

-- Structured numeric/categorical values extracted from lab reports & vitals logs.
-- This is what powers trend charts and month-over-month deltas.
create table if not exists lab_values (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  report_month date not null,
  metric_name text not null, -- e.g. "HbA1c", "Systolic BP", "LDL Cholesterol"
  value numeric,
  value_text text, -- fallback for non-numeric results
  unit text,
  ref_range_low numeric,
  ref_range_high numeric,
  ref_range_text text, -- fallback for non-numeric ranges (e.g. "Negative")
  out_of_range boolean,
  taken_on date, -- actual sample/measurement date if known, else report_month
  created_at timestamptz not null default now()
);

create index if not exists lab_values_person_metric_idx on lab_values (person_id, metric_name, report_month);

-- Chunked text + embeddings for RAG retrieval over all documents.
create table if not exists doc_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  report_month date not null,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(768), -- Gemini text-embedding-004 dimension
  created_at timestamptz not null default now()
);

create index if not exists doc_chunks_embedding_idx on doc_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- LLM-generated monthly summary comparing this month to prior history.
create table if not exists monthly_digests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  report_month date not null,
  summary_text text not null,
  improved jsonb not null default '[]', -- [{metric, from, to, note}]
  worsened jsonb not null default '[]',
  unchanged jsonb not null default '[]',
  recommendations jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (person_id, report_month)
);

-- Chat sessions + messages for the RAG assistant (conversation memory).
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- RLS: this is a private single-family app, so any authenticated user (anyone
-- you've invited into the Supabase project) can read/write everything. No public access.
alter table people enable row level security;
alter table documents enable row level security;
alter table lab_values enable row level security;
alter table doc_chunks enable row level security;
alter table monthly_digests enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

create policy "authenticated full access" on people for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on documents for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on lab_values for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on doc_chunks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on monthly_digests for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on chat_sessions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on chat_messages for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage: the `documents` bucket is private, and storage.objects has RLS on by
-- default, so without these policies every upload fails with
-- "new row violates row-level security policy".
create policy "authenticated read documents" on storage.objects
  for select to authenticated using (bucket_id = 'documents');
create policy "authenticated insert documents" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents');
create policy "authenticated update documents" on storage.objects
  for update to authenticated using (bucket_id = 'documents') with check (bucket_id = 'documents');
create policy "authenticated delete documents" on storage.objects
  for delete to authenticated using (bucket_id = 'documents');

-- Vector similarity search helper used by the RAG chat route.
create or replace function match_doc_chunks (
  query_embedding vector(768),
  match_person_id uuid,
  match_count int default 6
)
returns table (
  id uuid,
  document_id uuid,
  chunk_text text,
  report_month date,
  similarity float
)
language sql stable
as $$
  select
    doc_chunks.id,
    doc_chunks.document_id,
    doc_chunks.chunk_text,
    doc_chunks.report_month,
    1 - (doc_chunks.embedding <=> query_embedding) as similarity
  from doc_chunks
  where doc_chunks.person_id = match_person_id
  order by doc_chunks.embedding <=> query_embedding
  limit match_count;
$$;

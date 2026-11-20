-- Admin dashboard performance: indexes for the user list + certificate lookups. No new
-- tables (reuses profiles, certificates, audit_logs). No RLS changes — admin reads/mutations
-- go through server routes (service role) AFTER a server-side is_admin check.
create index if not exists idx_profiles_created on public.profiles (created_at desc);
create index if not exists idx_profiles_username on public.profiles (username);
create index if not exists idx_certificates_status on public.certificates (status);

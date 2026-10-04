-- Hosted Supabase provides pg_cron; lightweight local test engines may not.
do $$ begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
    perform cron.schedule('market-research-derivation', '* * * * *',
      'select public.process_research_jobs(50);');
  else
    raise notice 'pg_cron unavailable; install a processing schedule on the hosted project.';
  end if;
end $$;

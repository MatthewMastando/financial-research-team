-- Hosted Supabase may grant ALL on new public tables by default.
-- Reset this application's grants before granting only its supported operations.
do $$ declare t text; begin
  foreach t in array array[
    'app_owner','desks','assets','asset_aliases','reports','desk_runs',
    'report_sources','report_claims','report_assets','report_catalysts',
    'report_links','report_events','watchlist_entries','watchlist_evidence',
    'alerts','alert_reports','user_settings'
  ] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
  end loop;
end $$;
grant update(pinned,dismissed) on public.watchlist_entries to authenticated;
grant update(read_at) on public.alerts to authenticated;
grant update(timezone,suggestion_days,schedules) on public.user_settings to authenticated;

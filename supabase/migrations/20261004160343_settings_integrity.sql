-- Reject a browser-written timezone that would make private timestamps unrenderable.
create function private.valid_timezone(p_zone text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone);
$$;
revoke all on function private.valid_timezone(text) from public,anon;
grant execute on function private.valid_timezone(text) to authenticated,service_role;
alter table public.user_settings add constraint valid_display_timezone check(private.valid_timezone(timezone));
create index bot_credentials_owner on private.bot_credentials(owner_id);
create index bot_credentials_desk on private.bot_credentials(desk_slug);
create index reports_credential on public.reports(credential_id);
create index reports_desk on public.reports(desk_slug);
create index desk_runs_desk on public.desk_runs(desk_slug);
create index assets_underlying on public.assets(underlying_id);
create index aliases_asset on public.asset_aliases(asset_id);
create index report_assets_asset on public.report_assets(asset_id);
create index catalysts_report on public.report_catalysts(report_id);
create index links_related on public.report_links(related_report_id);
create index events_report on public.report_events(report_id);
create index watchlist_asset on public.watchlist_entries(asset_id);
create index evidence_report on public.watchlist_evidence(report_id);
create index alert_evidence_report on public.alert_reports(report_id);
create index jobs_owner on private.processing_jobs(owner_id);
create index rate_bucket_retention on private.rate_buckets(bucket);

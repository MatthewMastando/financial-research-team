create function public.report_history(p_id uuid) returns setof jsonb language sql stable security invoker set search_path='' as $$
 with recursive ancestors as (
  select r.id,r.supersedes_report_id from public.reports r where r.id=p_id
  union all select r.id,r.supersedes_report_id from public.reports r join ancestors a on r.id=a.supersedes_report_id
 ), chain as (
  select r.* from public.reports r where r.id=(select id from ancestors where supersedes_report_id is null)
  union all select r.* from public.reports r join chain c on r.supersedes_report_id=c.id
 )
 select c.payload||jsonb_build_object('id',c.id,'received_at',c.received_at,'is_current',not exists(select 1 from public.reports n where n.supersedes_report_id=c.id),
 'retracted',exists(select 1 from public.report_events e where e.report_id=c.id),
 'retraction_reason',(select e.reason from public.report_events e where e.report_id=c.id order by e.created_at desc limit 1)) from chain c order by c.received_at;
$$;
create function public.asset_theses(p_asset text) returns setof jsonb language sql stable security invoker set search_path='' as $$
 select distinct on(r.desk_slug) r.payload||jsonb_build_object('id',r.id,'received_at',r.received_at,'is_current',true)
 from public.reports r join public.report_assets a on a.report_id=r.id
 where a.asset_key=p_asset and a.relationship='subject' and r.payload->>'thesis' is not null and r.desk_slug<>'chief_of_staff'
 and not exists(select 1 from public.reports n where n.supersedes_report_id=r.id)
 and not exists(select 1 from public.report_events e where e.report_id=r.id)
 order by r.desk_slug,r.researched_at desc,r.received_at desc,r.id desc;
$$;
revoke all on function public.report_history(uuid),public.asset_theses(text) from public,anon;
grant execute on function public.report_history(uuid),public.asset_theses(text) to authenticated;
-- Evidence and status events are immutable as well as the parent report.
do $$ declare t text; begin
 foreach t in array array['report_sources','report_claims','report_assets','report_catalysts','report_links','report_events'] loop
  execute format('create trigger immutable_evidence before update or delete on public.%I for each row execute function private.reject_report_mutation()',t);
 end loop;
end $$;

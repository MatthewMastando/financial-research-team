-- Read the latest surviving report head per instrument and desk. Missing structured
-- guidance stays null; never fill it from a superseded or older recommendation.
create function public.asset_guidance(p_asset_ids uuid[]) returns setof jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_asset_ids is null or cardinality(p_asset_ids)>50 then raise exception 'Request at most 50 instruments' using errcode='22023'; end if;
 return query
 with heads as (
  select distinct on(a.asset_id,r.desk_slug) a.asset_id,a.asset_key,a.reason,r.*
  from public.report_assets a join public.reports r on r.id=a.report_id
  where a.asset_id=any(p_asset_ids) and a.relationship<>'context' and not r.is_demo
   and not exists(select 1 from public.reports n where n.supersedes_report_id=r.id)
  order by a.asset_id,r.desk_slug,r.researched_at desc,r.received_at desc,r.id desc
 )
 select jsonb_build_object('asset_id',h.asset_id,'asset_key',h.asset_key,'report_id',h.id,
  'report_title',h.payload->>'title','desk_slug',h.desk_slug,'researched_at',h.researched_at,
  'received_at',h.received_at,'time_horizon',h.payload->>'time_horizon','reason',h.reason,
  'thesis',h.payload->>'thesis','invalidation',h.payload->>'invalidation',
  'positioning',item->'positioning','trade_setup',item->'trade_setup')
 from heads h cross join lateral jsonb_array_elements(h.payload->'assets') item
 where item->>'asset_key'=h.asset_key
 and not exists(select 1 from public.report_events e where e.report_id=h.id);
end $$;
revoke all on function public.asset_guidance(uuid[]) from public,anon;
grant execute on function public.asset_guidance(uuid[]) to authenticated;

-- Validate saved plans in Postgres too: a browser cannot mark an incomplete plan ready.
create function private.valid_trade_setup(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb; expiry timestamptz;
begin
 if p is null or jsonb_typeof(p)<>'object' then return false; end if;
 if (select count(*) from jsonb_object_keys(p))<>11 or not p ?& array['direction','status','timeframe','entry_condition','entry_zone','stop_loss','targets','sizing_guidance','invalidation','instructions','valid_until'] then return false; end if;
 if p->>'status' is null or p->>'status' not in ('idea','conditional','ready','invalidated','closed') then return false; end if;
 if p->'direction'<>'null'::jsonb and (jsonb_typeof(p->'direction')<>'string' or p->>'direction' not in ('long','short')) then return false; end if;
 foreach k in array array['timeframe','entry_condition','entry_zone','stop_loss','sizing_guidance','invalidation','instructions'] loop
  v:=p->k;
  if v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or length(btrim(p->>k))<1 or length(p->>k)>case when k='instructions' then 8000 else 1000 end) then return false; end if;
 end loop;
 if jsonb_typeof(p->'targets')<>'array' then return false; end if;
 if jsonb_array_length(p->'targets')>20 then return false; end if;
 for v in select * from jsonb_array_elements(p->'targets') loop
  if jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}'))<1 or length(v#>>'{}')>1000 then return false; end if;
 end loop;
 if p->'valid_until'<>'null'::jsonb then
  if jsonb_typeof(p->'valid_until')<>'string' or (p->>'valid_until') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then return false; end if;
  expiry:=(p->>'valid_until')::timestamptz;
 end if;
 if p->>'status'='ready' then
  foreach k in array array['direction','entry_condition','stop_loss','sizing_guidance','invalidation','instructions'] loop
   if p->k='null'::jsonb then return false; end if;
  end loop;
  if jsonb_array_length(p->'targets')=0 then return false; end if;
 end if;
 return true;
exception when others then return false;
end $$;
revoke all on function private.valid_trade_setup(jsonb) from public,anon;
grant execute on function private.valid_trade_setup(jsonb) to authenticated,service_role;

-- Personal plans are separate from immutable, bot-authored research. Every save
-- creates a revision; an old editor cannot silently overwrite a newer plan.
create table public.trade_plan_revisions (
 owner_id uuid not null default auth.uid() references public.app_owner(owner_id),
 asset_id uuid not null references public.assets(id),
 revision integer not null check(revision>0),
 plan jsonb not null check(private.valid_trade_setup(plan)),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,asset_id,revision)
);
create index trade_plan_asset on public.trade_plan_revisions(asset_id);
alter table public.trade_plan_revisions enable row level security;
revoke all on public.trade_plan_revisions from public,anon,authenticated;
grant select on public.trade_plan_revisions to authenticated;
grant insert(asset_id,revision,plan) on public.trade_plan_revisions to authenticated;
create policy owner_read on public.trade_plan_revisions for select to authenticated
 using(owner_id=(select auth.uid()) and (select private.is_owner()));
create policy owner_insert on public.trade_plan_revisions for insert to authenticated
 with check(owner_id=(select auth.uid()) and (select private.is_owner()));
create function private.guard_trade_plan_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_revision integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text||':'||new.asset_id::text,0));
 select coalesce(max(revision),0) into current_revision from public.trade_plan_revisions where owner_id=new.owner_id and asset_id=new.asset_id;
 if new.revision<>current_revision+1 then raise exception 'Plan changed. Reload the latest revision before saving.' using errcode='40001'; end if;
 if new.plan->>'status'='ready' and new.plan->'valid_until'<>'null'::jsonb and (new.plan->>'valid_until')::timestamptz<=clock_timestamp() then
  raise exception 'A ready plan cannot already have expired' using errcode='23514';
 end if;
 new.created_at:=clock_timestamp();
 return new;
end $$;
revoke all on function private.guard_trade_plan_revision() from public,anon,authenticated;
create trigger guard_trade_plan_revision before insert on public.trade_plan_revisions for each row execute function private.guard_trade_plan_revision();
create trigger immutable_trade_plans before update or delete on public.trade_plan_revisions for each row execute function private.reject_report_mutation();
create function public.personal_trade_plans(p_asset_ids uuid[]) returns setof jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_asset_ids is null or cardinality(p_asset_ids)>50 then raise exception 'Request at most 50 instruments' using errcode='22023'; end if;
 return query select distinct on(p.asset_id) jsonb_build_object('asset_id',p.asset_id,'revision',p.revision,'plan',p.plan,'created_at',p.created_at)
 from public.trade_plan_revisions p where p.asset_id=any(p_asset_ids) order by p.asset_id,p.revision desc;
end $$;
revoke all on function public.personal_trade_plans(uuid[]) from public,anon;
grant execute on function public.personal_trade_plans(uuid[]) to authenticated;

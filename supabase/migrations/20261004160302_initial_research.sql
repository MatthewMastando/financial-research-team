-- Owner is provisioned administratively, never from user-editable metadata.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.app_owner (singleton boolean primary key default true check(singleton), owner_id uuid not null unique references auth.users(id));
alter table public.app_owner enable row level security;
create policy owner_config_read on public.app_owner for select to authenticated using (owner_id = (select auth.uid()));
grant select on public.app_owner to authenticated;

create function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_owner where owner_id=(select auth.uid()));
$$;
revoke all on function private.is_owner() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_owner() to authenticated;

create table public.desks (slug text primary key check(slug in ('macro','commodities','equities','crypto','chief_of_staff')), name text not null, enabled boolean not null default true, expected_cadence text not null default 'Unconfigured');
insert into public.desks(slug,name) values ('macro','Macro & Geopolitics'),('commodities','Commodities & Futures'),('equities','Equities & Trends'),('crypto','Crypto'),('chief_of_staff','Chief of Staff');
create table public.assets (id uuid primary key default gen_random_uuid(), asset_key text not null unique, asset_class text not null, name text not null, symbol text not null, venue text, currency text, underlying_id uuid references public.assets(id), expiry date);
-- These identify instruments only. No prices, recommendations or holdings are seeded.
insert into public.assets(asset_key,asset_class,name,symbol,venue,currency) values
 ('fx:EURUSD','fx','Euro / US dollar spot','EUR/USD',null,'USD'),
 ('equity:XNAS:AAPL','equity','Apple Inc.','AAPL','XNAS','USD'),
 ('crypto:BTC','crypto','Bitcoin','BTC',null,'USD'),
 ('theme:gold','commodity_theme','Gold market theme','Gold',null,null);
create table public.asset_aliases (id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.assets(id), provider text not null, provider_symbol text not null, verified_at timestamptz not null, unique(provider,provider_symbol));

create table private.bot_credentials (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), bot_id uuid not null, desk_slug text not null references public.desks(slug), token_hash text not null unique, scopes text[] not null, report_types text[] not null, revoked_at timestamptz, expires_at timestamptz, created_at timestamptz not null default now());
create table private.rate_buckets (credential_id uuid not null references private.bot_credentials(id), bucket timestamptz not null, requests int not null, primary key(credential_id,bucket));
create table public.desk_runs (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), bot_id uuid not null, desk_slug text not null references public.desks(slug), external_run_id text not null, started_at timestamptz not null, completed_at timestamptz, status text not null check(status in ('started','succeeded','failed')), error_code text, unique(owner_id,bot_id,external_run_id));
create index desk_runs_owner_desk on public.desk_runs(owner_id,desk_slug,started_at desc);
create table public.reports (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), bot_id uuid not null,
 credential_id uuid not null references private.bot_credentials(id), desk_slug text not null references public.desks(slug),
 submission_id text not null, payload_hash text not null, schema_version int not null check(schema_version=1),
 researched_at timestamptz not null, received_at timestamptz not null default clock_timestamp(),
 report_type text not null check(report_type in ('morning_scan','evening_wrap','breaking_update','thesis_revision','morning_brief')),
 importance text not null check(importance in ('normal','elevated','urgent')), is_demo boolean not null,
 supersedes_report_id uuid references public.reports(id), payload jsonb not null,
 search_document tsvector generated always as (to_tsvector('english',coalesce(payload->>'title','') || ' ' || coalesce(payload->>'summary','') || ' ' || coalesce(payload->>'body_markdown',''))) stored,
 unique(owner_id,bot_id,submission_id), unique(supersedes_report_id)
);
create index reports_owner_received on public.reports(owner_id,received_at desc,id desc);
create index reports_owner_desk_received on public.reports(owner_id,desk_slug,received_at desc,id desc);
create index reports_search on public.reports using gin(search_document);
create table public.report_sources (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), report_id uuid not null references public.reports(id), source_key text not null, url text not null check(url ~* '^https?://'), title text not null, published_at timestamptz, accessed_at timestamptz not null, unique(report_id,source_key));
create table public.report_claims (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), report_id uuid not null references public.reports(id), ordinal int not null, kind text not null, text text not null, source_keys text[] not null, unique(report_id,ordinal));
create table public.report_assets (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), report_id uuid not null references public.reports(id), asset_id uuid references public.assets(id), asset_key text not null, relationship text not null, watchlist_action text not null, reason text not null, unique(report_id,asset_key));
create index report_assets_lookup on public.report_assets(owner_id,asset_key,report_id);
create table public.report_catalysts (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), report_id uuid not null references public.reports(id), title text not null, asset_key text, expected_at text, timing_precision text not null, source_key text not null, description text not null);
create table public.report_links (owner_id uuid not null references public.app_owner(owner_id), report_id uuid not null references public.reports(id), related_report_id uuid not null references public.reports(id), relationship text not null default 'citation', primary key(report_id,related_report_id));
create table public.report_events (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), report_id uuid not null references public.reports(id), kind text not null check(kind='retraction'), reason text not null, created_at timestamptz not null default now());
create table public.watchlist_entries (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), asset_id uuid not null references public.assets(id), last_evidence_at timestamptz not null, expires_at timestamptz not null, pinned boolean not null default false, dismissed boolean not null default false, unique(owner_id,asset_id));
create table public.watchlist_evidence (owner_id uuid not null references public.app_owner(owner_id), entry_id uuid not null references public.watchlist_entries(id), report_id uuid not null references public.reports(id), reason text not null, primary key(entry_id,report_id));
create table public.alerts (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), event_key text not null, title text not null, severity text not null, event_at timestamptz not null, updated_at timestamptz not null, read_at timestamptz, unique(owner_id,event_key));
create table public.alert_reports (owner_id uuid not null references public.app_owner(owner_id), alert_id uuid not null references public.alerts(id), report_id uuid not null references public.reports(id), primary key(alert_id,report_id));
create table private.processing_jobs (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_owner(owner_id), report_id uuid not null unique references public.reports(id), job_type text not null default 'derive', attempts int not null default 0, available_at timestamptz not null default now(), leased_at timestamptz, completed_at timestamptz, last_error text);
create index jobs_available on private.processing_jobs(available_at) where completed_at is null;
create table public.user_settings (owner_id uuid primary key references public.app_owner(owner_id), timezone text not null default 'America/New_York', suggestion_days int not null default 14 check(suggestion_days between 1 and 90), schedules jsonb not null default '{}', external_notifications_enabled boolean not null default false check(not external_notifications_enabled));

-- Credentials and jobs have no browser grants. All private tables use RLS as defense in depth.
do $$ declare t text; begin
 foreach t in array array['bot_credentials','rate_buckets','processing_jobs'] loop
  execute format('alter table private.%I enable row level security',t);
 end loop;
 foreach t in array array['desks','assets','asset_aliases'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_read on public.%I for select to authenticated using ((select private.is_owner()))',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['reports','desk_runs','report_sources','report_claims','report_assets','report_catalysts','report_links','report_events','watchlist_entries','watchlist_evidence','alerts','alert_reports','user_settings'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_read on public.%I for select to authenticated using (owner_id=(select auth.uid()) and (select private.is_owner()))',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create index on public.%I(owner_id)',t);
 end loop;
 foreach t in array array['watchlist_entries','alerts','user_settings'] loop
  execute format('create policy owner_update on public.%I for update to authenticated using (owner_id=(select auth.uid()) and (select private.is_owner())) with check (owner_id=(select auth.uid()) and (select private.is_owner()))',t);
 end loop;
end $$;
grant update(pinned,dismissed) on public.watchlist_entries to authenticated;
grant update(read_at) on public.alerts to authenticated;
grant update(timezone,suggestion_days,schedules) on public.user_settings to authenticated;

create function private.reject_report_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Published research is append-only'; end $$;
create trigger immutable_reports before update or delete on public.reports for each row execute function private.reject_report_mutation();

-- Public wrappers are callable by the server role only, with no anonymous/authenticated execution.
create function public.authenticate_bot(p_hash text, p_scope text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.bot_credentials; n int; begin
 select * into c from private.bot_credentials where token_hash=p_hash and revoked_at is null and (expires_at is null or expires_at>now());
 if c.id is null then raise exception using errcode='PT401',message='Invalid credential'; end if;
 if not p_scope=any(c.scopes) then raise exception using errcode='PT403',message='Scope denied'; end if;
 insert into private.rate_buckets values(c.id,date_trunc('minute',now()),1) on conflict(credential_id,bucket) do update set requests=private.rate_buckets.requests+1 returning requests into n;
 if n>60 then return jsonb_build_object('rate_limited',true); end if;
 return jsonb_build_object('id',c.id,'owner_id',c.owner_id,'bot_id',c.bot_id,'desk_slug',c.desk_slug,'report_types',c.report_types);
end $$;

create function public.ingest_report(p_credential uuid, p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.bot_credentials; r public.reports; old public.reports; h text; child jsonb; aid uuid; ordinal int:=0; rid uuid; begin
 select * into c from private.bot_credentials where id=p_credential and revoked_at is null and (expires_at is null or expires_at>now()) for share;
 if c.id is null then raise exception using errcode='PT401',message='Invalid credential'; end if;
 if not 'reports:write'=any(c.scopes) or c.desk_slug<>p_payload->>'desk_slug' or not (p_payload->>'report_type')=any(c.report_types) then raise exception using errcode='PT403',message='Desk or report scope denied'; end if;
 -- Validation is performed by the shared versioned schema in the authenticated function.
 h:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(c.owner_id::text||c.bot_id::text||(p_payload->>'submission_id'),0));
 select * into r from public.reports where owner_id=c.owner_id and bot_id=c.bot_id and submission_id=p_payload->>'submission_id';
 if r.id is not null then
  if r.payload_hash<>h then raise exception using errcode='PT409',message='Submission ID reused with different content'; end if;
  return jsonb_build_object('report_id',r.id,'submission_id',r.submission_id,'received_at',r.received_at,'duplicate',true,'processing_status',case when exists(select 1 from private.processing_jobs where report_id=r.id and completed_at is not null) then 'completed' else 'pending' end);
 end if;
 if p_payload->>'supersedes_report_id' is not null then
  select * into old from public.reports where id=(p_payload->>'supersedes_report_id')::uuid and owner_id=c.owner_id for update;
  if old.id is null or old.desk_slug<>c.desk_slug or old.is_demo<>(p_payload->>'is_demo')::boolean then raise exception using errcode='PT422',message='Revision target denied'; end if;
  if exists(select 1 from public.reports where supersedes_report_id=old.id) then raise exception using errcode='PT409',message='Revision head changed'; end if;
 end if;
 for child in select * from jsonb_array_elements(p_payload->'related_report_ids') loop
  if not exists(select 1 from public.reports where id=(child#>>'{}')::uuid and owner_id=c.owner_id and is_demo=(p_payload->>'is_demo')::boolean) then raise exception using errcode='PT422',message='Related report unavailable'; end if;
 end loop;
 insert into public.reports(owner_id,bot_id,credential_id,desk_slug,submission_id,payload_hash,schema_version,researched_at,report_type,importance,is_demo,supersedes_report_id,payload)
 values(c.owner_id,c.bot_id,c.id,c.desk_slug,p_payload->>'submission_id',h,1,(p_payload->>'researched_at')::timestamptz,p_payload->>'report_type',p_payload->>'importance',(p_payload->>'is_demo')::boolean,(p_payload->>'supersedes_report_id')::uuid,p_payload) returning * into r;
 for child in select * from jsonb_array_elements(p_payload->'sources') loop
  insert into public.report_sources(owner_id,report_id,source_key,url,title,published_at,accessed_at) values(c.owner_id,r.id,child->>'source_key',child->>'url',child->>'title',(child->>'published_at')::timestamptz,(child->>'accessed_at')::timestamptz);
 end loop;
 for child in select * from jsonb_array_elements(p_payload->'claims') loop
  insert into public.report_claims(owner_id,report_id,ordinal,kind,text,source_keys) values(c.owner_id,r.id,ordinal,child->>'kind',child->>'text',array(select jsonb_array_elements_text(child->'source_keys'))); ordinal:=ordinal+1;
 end loop;
 for child in select * from jsonb_array_elements(p_payload->'assets') loop
  aid:=null; select id into aid from public.assets where asset_key=child->>'asset_key';
  insert into public.report_assets(owner_id,report_id,asset_id,asset_key,relationship,watchlist_action,reason) values(c.owner_id,r.id,aid,child->>'asset_key',child->>'relationship',child->>'watchlist_action',child->>'reason');
 end loop;
 for child in select * from jsonb_array_elements(p_payload->'catalysts') loop
  insert into public.report_catalysts(owner_id,report_id,title,asset_key,expected_at,timing_precision,source_key,description) values(c.owner_id,r.id,child->>'title',child->>'asset_key',child->>'expected_at',child->>'timing_precision',child->>'source_key',child->>'description');
 end loop;
 for child in select * from jsonb_array_elements(p_payload->'related_report_ids') loop
  rid:=(child#>>'{}')::uuid; insert into public.report_links values(c.owner_id,r.id,rid,'citation');
 end loop;
 insert into private.processing_jobs(owner_id,report_id) values(c.owner_id,r.id);
 return jsonb_build_object('report_id',r.id,'submission_id',r.submission_id,'received_at',r.received_at,'duplicate',false,'processing_status','pending');
end $$;

create function public.process_research_jobs(p_limit int default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.processing_jobs; r public.reports; a record; eid uuid; alertid uuid; k text; days int; zone text; done int:=0; failed int:=0; evidence bool; begin
 for j in select * from private.processing_jobs where completed_at is null and available_at<=now() and attempts<10 order by available_at limit least(greatest(p_limit,1),50) for update skip locked loop
  update private.processing_jobs set attempts=attempts+1,leased_at=now() where id=j.id;
  begin
   select * into r from public.reports where id=j.report_id;
   if not r.is_demo and not exists(select 1 from public.report_events re where re.report_id=r.id) then
    select suggestion_days,timezone into days,zone from public.user_settings where owner_id=r.owner_id; days:=coalesce(days,14); zone:=coalesce(zone,'America/New_York');
    for a in select ra.* from public.report_assets ra where ra.report_id=r.id and ra.asset_id is not null and
     (ra.watchlist_action='suggest' or (ra.relationship='subject' and exists(select 1 from public.report_catalysts rc where rc.report_id=r.id and rc.asset_key=ra.asset_key and rc.expected_at is not null and ((rc.timing_precision='date' and rc.expected_at::date>=(now() at time zone zone)::date) or (rc.timing_precision='exact' and rc.expected_at::timestamptz>=now()))))) loop
     -- Expiry uses research time: late old research must not create a fresh recommendation.
     insert into public.watchlist_entries(owner_id,asset_id,last_evidence_at,expires_at) values(r.owner_id,a.asset_id,r.researched_at,r.researched_at+make_interval(days=>days))
      on conflict(owner_id,asset_id) do update set last_evidence_at=greatest(public.watchlist_entries.last_evidence_at,excluded.last_evidence_at),expires_at=greatest(public.watchlist_entries.last_evidence_at,excluded.last_evidence_at)+make_interval(days=>days) returning id into eid;
     insert into public.watchlist_evidence values(r.owner_id,eid,r.id,a.reason) on conflict do nothing;
    end loop;
    evidence:=exists(select 1 from public.report_sources where report_id=r.id) or (r.report_type='morning_brief' and exists(select 1 from public.report_links where report_id=r.id));
    if evidence and (r.importance in ('elevated','urgent') or r.report_type='thesis_revision' or jsonb_array_length(coalesce(r.payload->'disagreements','[]'))>0) then
     k:=coalesce(r.payload->>'event_key',r.supersedes_report_id::text,r.id::text);
     -- A revision with no event key inherits its preceding alert group.
     if r.supersedes_report_id is not null and r.payload->>'event_key' is null then select al.event_key into k from public.alerts al join public.alert_reports ar on ar.alert_id=al.id where ar.report_id=r.supersedes_report_id limit 1; k:=coalesce(k,r.supersedes_report_id::text); end if;
     select id into alertid from public.alerts where owner_id=r.owner_id and event_key=k for update;
     if alertid is null then
      insert into public.alerts(owner_id,event_key,title,severity,event_at,updated_at) values(r.owner_id,k,r.payload->>'title',r.importance,r.researched_at,r.received_at) on conflict(owner_id,event_key) do nothing returning id into alertid;
      if alertid is null then select id into alertid from public.alerts where owner_id=r.owner_id and event_key=k for update; end if;
     end if;
     if not exists(select 1 from public.alert_reports where alert_id=alertid and report_id=r.id) then
      insert into public.alert_reports values(r.owner_id,alertid,r.id);
      update public.alerts set title=case when r.received_at>=updated_at then r.payload->>'title' else title end,
       severity=case when r.importance='urgent' or severity='urgent' then 'urgent' when r.importance='elevated' or severity='elevated' then 'elevated' else 'normal' end,
       read_at=case when r.received_at>updated_at then null else read_at end, updated_at=greatest(updated_at,r.received_at) where id=alertid;
     end if;
    end if;
   end if;
   update private.processing_jobs set completed_at=now(),last_error=null,leased_at=null where id=j.id; done:=done+1;
  exception when others then
   update private.processing_jobs set available_at=now()+make_interval(secs=>least(3600,power(2,j.attempts+1)::int)),last_error='derivation_failed',leased_at=null where id=j.id; failed:=failed+1;
  end;
 end loop;
 return jsonb_build_object('completed',done,'failed',failed);
end $$;

create function public.record_desk_run(p_credential uuid,p_run jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c private.bot_credentials; rid uuid; begin
 select * into c from private.bot_credentials where id=p_credential and revoked_at is null and (expires_at is null or expires_at>now()) for share;
 if c.id is null or not 'runs:write'=any(c.scopes) then raise exception using errcode='PT403',message='Run scope denied'; end if;
 insert into public.desk_runs(owner_id,bot_id,desk_slug,external_run_id,started_at,completed_at,status,error_code)
 values(c.owner_id,c.bot_id,c.desk_slug,p_run->>'external_run_id',(p_run->>'started_at')::timestamptz,(p_run->>'completed_at')::timestamptz,p_run->>'status',p_run->>'error_code')
 on conflict(owner_id,bot_id,external_run_id) do update set completed_at=excluded.completed_at,status=excluded.status,error_code=excluded.error_code
 where public.desk_runs.status='started' returning id into rid;
 return rid;
end $$;

create function public.search_reports(p_filters jsonb default '{}',p_cursor jsonb default null,p_limit int default 30) returns setof jsonb language sql stable security invoker set search_path='' as $$
 select r.payload || jsonb_build_object('id',r.id,'received_at',r.received_at,'is_current',not exists(select 1 from public.reports newer where newer.supersedes_report_id=r.id), 'retracted',exists(select 1 from public.report_events re where re.report_id=r.id))
 from public.reports r where
 (p_filters->>'q' is null or r.search_document@@websearch_to_tsquery('english',left(p_filters->>'q',200))) and
 (p_filters->>'desk' is null or r.desk_slug=p_filters->>'desk') and
 (p_filters->>'type' is null or r.report_type=p_filters->>'type') and
 (p_filters->>'importance' is null or r.importance=p_filters->>'importance') and
 (p_filters->>'from' is null or r.researched_at>=(p_filters->>'from')::timestamptz) and
 (p_filters->>'to' is null or r.researched_at<(p_filters->>'to')::date+interval '1 day') and
 (p_filters->>'asset' is null or exists(select 1 from public.report_assets a where a.report_id=r.id and a.asset_key=p_filters->>'asset')) and
 (p_cursor is null or (r.received_at,r.id)<((p_cursor->>'received_at')::timestamptz,(p_cursor->>'id')::uuid))
 order by r.received_at desc,r.id desc limit least(greatest(p_limit,1),100);
$$;
create function public.bot_research_context(p_credential uuid,p_filters jsonb,p_cursor jsonb,p_limit int) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.bot_credentials; items jsonb; theses jsonb; begin
 select * into c from private.bot_credentials where id=p_credential and revoked_at is null and (expires_at is null or expires_at>now()) for share;
 if c.id is null or not 'research:read'=any(c.scopes) then raise exception using errcode='PT403',message='Read scope denied'; end if;
 select coalesce(jsonb_agg(x.data order by x.received_at,x.id),'[]') into items from (
  select r.payload||jsonb_build_object('id',r.id,'received_at',r.received_at,'is_current',not exists(select 1 from public.reports n where n.supersedes_report_id=r.id)) data,r.received_at,r.id
  from public.reports r where r.owner_id=c.owner_id and not r.is_demo and
   (p_filters->>'since' is null or r.received_at>=(p_filters->>'since')::timestamptz) and
   (p_filters->>'desk' is null or r.desk_slug=p_filters->>'desk') and
   (p_filters->>'type' is null or r.report_type=p_filters->>'type') and
   (p_filters->>'asset' is null or exists(select 1 from public.report_assets a where a.report_id=r.id and a.asset_key=p_filters->>'asset')) and
   (p_cursor is null or (r.received_at,r.id)>((p_cursor->>'received_at')::timestamptz,(p_cursor->>'id')::uuid))
  order by r.received_at,r.id limit least(greatest(p_limit,1),100)
 ) x;
 select coalesce(jsonb_agg(t.data),'[]') into theses from (
  select distinct on (r.desk_slug,ra.asset_key) r.payload||jsonb_build_object('id',r.id,'received_at',r.received_at) data
  from public.reports r join public.report_assets ra on ra.report_id=r.id where r.owner_id=c.owner_id and not r.is_demo and r.payload->>'thesis' is not null and ra.relationship='subject'
   and (p_filters->>'asset' is null or ra.asset_key=p_filters->>'asset') and not exists(select 1 from public.reports n where n.supersedes_report_id=r.id)
   and not exists(select 1 from public.report_events e where e.report_id=r.id)
  order by r.desk_slug,ra.asset_key,r.researched_at desc limit 50
 ) t;
 return jsonb_build_object('reports',items,'active_theses',theses);
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('authenticate_bot','ingest_report','process_research_jobs','record_desk_run','bot_research_context') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
revoke all on function public.search_reports(jsonb,jsonb,int) from public,anon;
grant execute on function public.search_reports(jsonb,jsonb,int) to authenticated;
-- Supabase creates this publication; the local database harness supplies it too.
alter publication supabase_realtime add table public.reports,public.alerts,public.watchlist_entries,public.desk_runs;

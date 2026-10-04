-- Canonical identities from the owner's existing report keys. No invented futures expiries.
insert into public.assets(asset_key,asset_class,name,symbol,venue,currency) values
 ('equity:XNAS:MU','equity','Micron Technology','MU','XNAS','USD'),
 ('equity:XNAS:MSFT','equity','Microsoft','MSFT','XNAS','USD'),
 ('equity:XNAS:CEG','equity','Constellation Energy','CEG','XNAS','USD'),
 ('equity:XNAS:APLD','equity','Applied Digital','APLD','XNAS','USD'),
 ('equity:XNAS:PEP','equity','PepsiCo','PEP','XNAS','USD'),
 ('equity:XNAS:STX','equity','Seagate Technology','STX','XNAS','USD'),
 ('equity:XNAS:TSLA','equity','Tesla','TSLA','XNAS','USD'),
 ('equity:XNAS:NVDA','equity','NVIDIA','NVDA','XNAS','USD'),
 ('equity:XNYS:VST','equity','Vistra','VST','XNYS','USD'),
 ('equity:XNYS:NKE','equity','Nike','NKE','XNYS','USD'),
 ('equity:XNYS:STZ','equity','Constellation Brands','STZ','XNYS','USD'),
 ('equity:XNYS:JPM','equity','JPMorgan Chase','JPM','XNYS','USD'),
 ('equity:XNYS:DAL','equity','Delta Air Lines','DAL','XNYS','USD'),
 ('equity:ARCX:RSP','etf','Invesco S&P 500 Equal Weight ETF','RSP','ARCX','USD'),
 ('crypto:ETH','crypto','Ethereum','ETH',null,'USD'),
 ('crypto:SOL','crypto','Solana','SOL',null,'USD'),
 ('crypto:HYPE','crypto','Hyperliquid','HYPE',null,'USD'),
 ('theme:wti_crude','commodity_theme','WTI crude oil market theme','WTI crude',null,null),
 ('theme:brent_crude','commodity_theme','Brent crude oil market theme','Brent crude',null,null),
 ('theme:natural_gas','commodity_theme','Natural gas market theme','Natural gas',null,null),
 ('theme:silver','commodity_theme','Silver market theme','Silver',null,null),
 ('theme:copper','commodity_theme','Copper market theme','Copper',null,null),
 ('theme:corn','commodity_theme','Corn market theme','Corn',null,null),
 ('theme:wheat','commodity_theme','Wheat market theme','Wheat',null,null),
 ('theme:soybeans','commodity_theme','Soybeans market theme','Soybeans',null,null)
 on conflict(asset_key) do nothing;

-- Candidate mappings are not marked verified until a validated quote is received.
-- Catalog listing alone is not proof of account entitlement.
alter table public.asset_aliases alter column verified_at drop not null;
insert into public.asset_aliases(asset_id,provider,provider_symbol,verified_at)
 select id,'twelve_data',case when asset_class='crypto' then symbol||'/'||currency else symbol end,null
 from public.assets where asset_class in ('equity','etf','fx','crypto') and currency='USD' and expiry is null
 on conflict(provider,provider_symbol) do nothing;

-- The catalog foreign key is derived metadata. Only NULL -> exact-key resolution is mutable.
create function private.guard_report_asset_link() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.asset_id is null and new.asset_id is not null
   and (to_jsonb(new)-'asset_id')=(to_jsonb(old)-'asset_id')
   and exists(select 1 from public.assets a where a.id=new.asset_id and a.asset_key=new.asset_key)
  then return new; end if;
 end if;
 raise exception 'Published research is append-only';
end;
$$;
revoke all on function private.guard_report_asset_link() from public,anon,authenticated;
drop trigger immutable_evidence on public.report_assets;
create trigger immutable_evidence before update or delete on public.report_assets
 for each row execute function private.guard_report_asset_link();

create index report_assets_unresolved_key on public.report_assets(asset_key) where asset_id is null;
create function private.link_catalog_asset(p_asset uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.assets%rowtype;
begin
 select * into a from public.assets where id=p_asset;
 if a.id is null then return; end if;
 update public.report_assets set asset_id=a.id where asset_key=a.asset_key and asset_id is null;
 -- Recompute only suggestions/evidence; leave alerts, receipts, reports and jobs untouched.
 insert into public.watchlist_entries(owner_id,asset_id,last_evidence_at,expires_at)
 select r.owner_id,a.id,max(r.researched_at),max(r.researched_at)+make_interval(days=>s.suggestion_days)
 from public.report_assets ra join public.reports r on r.id=ra.report_id
 join public.user_settings s on s.owner_id=r.owner_id
 where ra.asset_id=a.id and not r.is_demo and not exists(select 1 from public.report_events re where re.report_id=r.id)
 and (ra.watchlist_action='suggest' or (ra.relationship='subject' and exists(
   select 1 from public.report_catalysts rc where rc.report_id=r.id and rc.asset_key=ra.asset_key and rc.expected_at is not null
   and ((rc.timing_precision='date' and rc.expected_at::date >= (now() at time zone s.timezone)::date)
     or (rc.timing_precision='exact' and rc.expected_at::timestamptz>=now())))))
 group by r.owner_id,s.suggestion_days
 on conflict(owner_id,asset_id) do update set
 last_evidence_at=greatest(public.watchlist_entries.last_evidence_at,excluded.last_evidence_at),
 expires_at=greatest(public.watchlist_entries.expires_at,excluded.expires_at);
 insert into public.watchlist_evidence(owner_id,entry_id,report_id,reason)
 select r.owner_id,w.id,r.id,ra.reason from public.report_assets ra join public.reports r on r.id=ra.report_id
 join public.user_settings s on s.owner_id=r.owner_id
 join public.watchlist_entries w on w.owner_id=r.owner_id and w.asset_id=ra.asset_id
 where ra.asset_id=a.id and not r.is_demo and not exists(select 1 from public.report_events re where re.report_id=r.id)
 and (ra.watchlist_action='suggest' or (ra.relationship='subject' and exists(
   select 1 from public.report_catalysts rc where rc.report_id=r.id and rc.asset_key=ra.asset_key and rc.expected_at is not null
   and ((rc.timing_precision='date' and rc.expected_at::date >= (now() at time zone s.timezone)::date)
     or (rc.timing_precision='exact' and rc.expected_at::timestamptz>=now())))))
 on conflict do nothing;
end;
$$;
revoke all on function private.link_catalog_asset(uuid) from public,anon,authenticated;
create function private.link_new_catalog_asset() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.link_catalog_asset(new.id); return new; end;
$$;
revoke all on function private.link_new_catalog_asset() from public,anon,authenticated;
create trigger link_new_catalog_asset after insert on public.assets
 for each row execute function private.link_new_catalog_asset();
do $$ declare a record; begin
 for a in select id from public.assets loop perform private.link_catalog_asset(a.id); end loop;
end $$;

-- Persist sanitized probe results, and mark aliases verified only for actual valid quotes.
create or replace function public.complete_twelve_data_quote(p_key text, p_lease uuid, p_quote jsonb, p_retry_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
declare wrote boolean;
begin
 if p_retry_seconds < 60 or p_retry_seconds > 86400 or p_retry_seconds is null then raise exception 'Invalid refresh interval'; end if;
 update private.quote_cache set quote=coalesce(p_quote,quote),
 next_refresh_at=clock_timestamp()+make_interval(secs=>p_retry_seconds),lease_id=null,lease_until=null
 where cache_key=p_key and lease_id=p_lease;
 wrote:=found;
 if wrote and p_quote->>'provider'='Twelve Data' and (p_quote->>'price') is not null and p_quote->>'entitlement'='live' and p_quote->>'unavailable_reason' is null then
  update public.asset_aliases set verified_at=clock_timestamp() where asset_id=(p_quote->>'asset_id')::uuid
   and provider='twelve_data' and provider_symbol=p_quote->>'provider_symbol';
 end if;
end;
$$;
revoke all on function public.complete_twelve_data_quote(text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.complete_twelve_data_quote(text,uuid,jsonb,integer) to service_role;

-- Every structured reference is visible, even when its identity/price mapping is unknown.
alter table public.assets add column identity_verified boolean not null default true;
create function private.ensure_report_asset(p_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare aid uuid; parts text[]; display_symbol text;
begin
 if p_key is null or length(p_key)>120 or p_key !~ '^[a-z][a-z_]*:[A-Za-z0-9._:/-]+$' then raise exception 'Invalid asset key'; end if;
 select id into aid from public.assets where asset_key=p_key;
 if aid is not null then return aid; end if;
 parts:=string_to_array(p_key,':');
 display_symbol:=case when parts[1] in ('future','futures') and cardinality(parts)>=3 then parts[3]
 else parts[cardinality(parts)] end;
 insert into public.assets(asset_key,asset_class,name,symbol,identity_verified)
 values(p_key,'research_only','Reported '||replace(display_symbol,'_',' ')||' instrument',display_symbol,false)
 on conflict(asset_key) do nothing;
 select id into aid from public.assets where asset_key=p_key;
 return aid;
end;
$$;
revoke all on function private.ensure_report_asset(text) from public,anon,authenticated;
create function private.register_report_asset() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.reports where id=new.report_id and is_demo) then
  select id into new.asset_id from public.assets where asset_key=new.asset_key;
 else new.asset_id:=private.ensure_report_asset(new.asset_key); end if;
 return new;
end;
$$;
revoke all on function private.register_report_asset() from public,anon,authenticated;
create trigger register_report_asset before insert on public.report_assets
 for each row execute function private.register_report_asset();
do $$ declare a record; begin
 for a in select distinct ra.asset_key from public.report_assets ra join public.reports r on r.id=ra.report_id where ra.asset_id is null and not r.is_demo loop
  perform private.ensure_report_asset(a.asset_key);
 end loop;
end $$;

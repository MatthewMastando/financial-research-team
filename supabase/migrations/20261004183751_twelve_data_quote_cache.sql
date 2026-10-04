-- Shared cache and credit reservations for the owner's Twelve Data Basic trial.
-- No provider credentials are stored here. Service role is the only API caller.
create table private.quote_cache (
  cache_key text primary key,
  quote jsonb,
  next_refresh_at timestamptz not null default '-infinity',
  lease_id uuid,
  lease_until timestamptz
);
create table private.quote_budget (
  provider text primary key check (provider = 'twelve_data'),
  request_times timestamptz[] not null default '{}',
  day date not null,
  daily_used integer not null default 0 check (daily_used >= 0)
);
alter table private.quote_cache enable row level security;
alter table private.quote_budget enable row level security;
revoke all on private.quote_cache, private.quote_budget from public, anon, authenticated;
insert into private.quote_budget(provider, day) values ('twelve_data', (now() at time zone 'UTC')::date);

create function public.claim_twelve_data_quote(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c private.quote_cache%rowtype;
  b private.quote_budget%rowtype;
  t timestamptz := clock_timestamp();
  today date := (t at time zone 'UTC')::date;
  recent timestamptz[];
  lease uuid;
begin
  if length(p_key) > 1024 or p_key is null then raise exception 'Invalid cache key'; end if;
  insert into private.quote_cache(cache_key) values(p_key) on conflict do nothing;
  select * into c from private.quote_cache where cache_key = p_key for update;
  if c.next_refresh_at > t or c.lease_until > t then
    return jsonb_build_object('quote', c.quote);
  end if;
  select * into b from private.quote_budget where provider = 'twelve_data' for update;
  select coalesce(array_agg(v), '{}'::timestamptz[]) into recent
    from unnest(b.request_times) as v where v > t - interval '60 seconds';
  if b.day <> today then b.daily_used := 0; end if;
  -- Reserve at most 8 credits in any rolling minute and 750 per UTC day.
  -- Fifty daily credits remain for account testing outside this app.
  if cardinality(recent) >= 8 or b.daily_used >= 750 then
    return jsonb_build_object('quote', c.quote);
  end if;
  update private.quote_budget set request_times = array_append(recent, t),
    day = today, daily_used = b.daily_used + 1 where provider = 'twelve_data';
  lease := gen_random_uuid();
  update private.quote_cache set lease_id = lease, lease_until = t + interval '15 seconds'
    where cache_key = p_key;
  return jsonb_build_object('quote', c.quote, 'lease', lease);
end;
$$;

create function public.complete_twelve_data_quote(p_key text, p_lease uuid, p_quote jsonb, p_retry_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_retry_seconds < 60 or p_retry_seconds > 86400 or p_retry_seconds is null then
    raise exception 'Invalid refresh interval';
  end if;
  update private.quote_cache set quote = coalesce(p_quote, quote),
    next_refresh_at = clock_timestamp() + make_interval(secs => p_retry_seconds),
    lease_id = null, lease_until = null
    where cache_key = p_key and lease_id = p_lease;
end;
$$;
revoke all on function public.claim_twelve_data_quote(text), public.complete_twelve_data_quote(text, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.claim_twelve_data_quote(text), public.complete_twelve_data_quote(text, uuid, jsonb, integer) to service_role;

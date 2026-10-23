-- Run once in a Supabase project's SQL editor. Public API exposes only these RPCs.
create table if not exists public.league_teams (
 id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 2 and 40),
 name_key text not null unique, total bigint not null default 0, plays bigint not null default 0, best integer not null default 0
);
create table if not exists public.league_runs (
 token uuid primary key default gen_random_uuid(), team_id uuid not null references public.league_teams(id),
 started_at timestamptz not null default now(), score integer, finished_at timestamptz
);
alter table public.league_teams enable row level security;
alter table public.league_runs enable row level security;
revoke all on public.league_teams, public.league_runs from anon, authenticated;

create or replace function public.league_add_team(team_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n text; k text; t public.league_teams;
begin
 n := trim(regexp_replace(normalize(team_name,NFKC),'\s+',' ','g'));
 if n is null or char_length(n)<2 or char_length(n)>40 then raise exception 'Invalid company name'; end if;
 k := lower(regexp_replace(n,'\s','','g'));
 insert into public.league_teams(name,name_key) values(n,k) on conflict(name_key) do nothing;
 select * into t from public.league_teams where name_key=k;
 return to_jsonb(t)-'name_key';
end $$;
create or replace function public.league_search(q text default '') returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)-'name_key'),'[]'::jsonb) from
 (select * from public.league_teams where strpos(name_key,lower(regexp_replace(normalize(coalesce(q,''),NFKC),'\s','','g')))>0 order by name limit 30) t;
$$;
create or replace function public.league_rankings() returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)-'name_key'),'[]'::jsonb) from
 (select * from public.league_teams order by total desc,best desc,name limit 100) t;
$$;
create or replace function public.league_start(team_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
 insert into public.league_runs(team_id) values(league_start.team_id) returning league_runs.token into token;
 return token;
end $$;
create or replace function public.league_finish(run_token uuid,run_score integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.league_runs;
begin
 select * into r from public.league_runs where token=run_token for update;
 if not found then raise exception 'Unknown run'; end if;
 if r.finished_at is not null then return jsonb_build_object('accepted',true,'score',r.score); end if;
 if run_score is null or run_score<0 or run_score>200000 or run_score%50<>0 then raise exception 'Invalid score'; end if;
 if clock_timestamp()-r.started_at<interval '59 seconds' then raise exception 'Round has not finished'; end if;
 update public.league_runs set score=run_score,finished_at=clock_timestamp() where token=run_token;
 update public.league_teams set total=total+run_score,plays=plays+1,best=greatest(best,run_score) where id=r.team_id;
 return jsonb_build_object('accepted',true,'score',run_score);
end $$;
revoke all on function public.league_add_team(text), public.league_search(text), public.league_rankings(), public.league_start(uuid), public.league_finish(uuid,integer) from public, anon, authenticated;
grant execute on function public.league_add_team(text), public.league_search(text), public.league_rankings(), public.league_start(uuid), public.league_finish(uuid,integer) to anon;
select public.league_add_team(n) from unnest(array['롯데','삼성전자','현대자동차','LG전자','SK텔레콤','한화','CJ','두산']) n;

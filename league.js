(() => {
  'use strict';
  const $=id=>document.getElementById(id), cfg=window.LEAGUE_CONFIG||{};
  const online=!!(cfg.supabaseUrl&&cfg.publishableKey);
  const STORE='after-hours-company-league-v1';
  const initial=['롯데','삼성전자','현대자동차','LG전자','SK텔레콤','한화','CJ','두산'];
  let data={teams:initial.map((name,i)=>({id:`team-${i}`,name,total:0,plays:0,best:0})),runs:[]}, selected=null, teams=[],active=null,pending=null,queryVersion=0;
  try{const saved=JSON.parse(localStorage.getItem(STORE));if(saved&&Array.isArray(saved.teams)&&Array.isArray(saved.runs))data=saved;}catch(_){}
  const clean=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ');
  const key=s=>clean(s).replace(/\s/g,'').toLowerCase();
  const id=()=>crypto.randomUUID();
  function persist(){try{localStorage.setItem(STORE,JSON.stringify(data));return true;}catch(_){return false;}}
  async function rpc(name,args={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{const res=await fetch(`${cfg.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(args),signal:controller.signal});if(!res.ok)throw new Error('서버 연결 또는 설정을 확인해주세요.');return await res.json();}finally{clearTimeout(timer);}
  }
  function choose(team){selected=team;$('teamHint').textContent=`선택한 팀: ${team.name} · 공통 맵에서 획득한 점수가 이 팀에 더해집니다.`;renderTeams();}
  function renderTeams(){
    $('companyList').replaceChildren();
    for(const t of teams){const b=document.createElement('button');b.type='button';b.textContent=t.name;b.className='company-chip';b.setAttribute('aria-pressed',String(selected?.id===t.id));b.addEventListener('click',()=>choose(t));$('companyList').append(b);}
    if(!teams.length){const p=document.createElement('p');p.textContent='검색 결과가 없습니다. 회사명을 입력하고 팀을 등록하세요.';$('companyList').append(p);}
  }
  async function search(){const version=++queryVersion,q=clean($('companySearch').value);try{const rows=online?await rpc('league_search',{q}):data.teams.filter(t=>key(t.name).includes(key(q))).slice(0,30);if(version!==queryVersion)return;teams=rows;if(!selected&&teams.length)choose(teams[0]);else renderTeams();}catch(e){if(version===queryVersion)$('teamHint').textContent='회사 목록을 불러오지 못했습니다. 잠시 후 다시 검색해주세요.';}}
  async function add(){const name=clean($('companySearch').value);if(name.length<2||name.length>40){$('teamHint').textContent='회사명을 2~40자로 입력해주세요.';return;}$('addCompany').disabled=true;try{let t;if(online)t=await rpc('league_add_team',{team_name:name});else{t=data.teams.find(t=>key(t.name)===key(name));if(!t){t={id:id(),name,total:0,plays:0,best:0};data.teams.push(t);persist();}}choose(t);await search();}catch(e){$('teamHint').textContent='팀 등록에 실패했습니다. 연결을 확인하고 다시 시도해주세요.';}finally{$('addCompany').disabled=false;}}
  async function rankings(){
    $('leagueMode').textContent=online?'온라인 리그 · 순위를 불러오는 중…':'이 브라우저의 연습 리그 · 다른 사람의 점수와 합산되지 않습니다';
    try{const rows=online?await rpc('league_rankings'):data.teams.slice().sort((a,b)=>b.total-a.total||b.best-a.best||a.name.localeCompare(b.name));$('rankings').replaceChildren();rows.forEach((t,i)=>{const row=document.createElement('div');row.className='rank-row';const rank=document.createElement('b'),name=document.createElement('span'),total=document.createElement('strong');rank.textContent=String(i+1).padStart(2,'0');name.textContent=`${t.name} · ${t.plays}게임`;total.textContent=`${Number(t.total).toLocaleString()} PTS`;row.append(rank,name,total);$('rankings').append(row);});if(online)$('leagueMode').textContent='온라인 리그 · 전체 누적 점수 상위 100팀';}catch(e){$('leagueMode').textContent='온라인 순위를 불러오지 못했습니다. 새로고침으로 다시 시도해주세요.';}
  }
  async function start(){if(!selected)throw new Error('먼저 회사 팀을 선택해주세요.');if(pending)throw new Error('이전 점수 등록을 다시 시도한 뒤 시작해주세요.');const team={...selected};const token=online?await rpc('league_start',{team_id:team.id}):id();active={token,team};$('teamBadge').textContent=`${team.name} 팀 · 공통 도전 맵`;$('contribution').textContent='';$('retryScore').hidden=true;}
  async function submit(){if(!pending)return;const round=pending;$('backLobby').disabled=true;$('retryScore').hidden=true;$('contribution').textContent=`${round.team.name} 팀에 점수를 등록하는 중…`;try{if(online)await rpc('league_finish',{run_token:round.token,run_score:round.score});else if(!data.runs.includes(round.token)){const t=data.teams.find(t=>t.id===round.team.id);t.total+=round.score;t.plays++;t.best=Math.max(t.best,round.score);data.runs.push(round.token);round.saved=persist();}if(pending===round)pending=null;$('backLobby').disabled=false;$('contribution').textContent=`${round.team.name} 팀 +${round.score.toLocaleString()}점 · ${online?'온라인 합산 완료':round.saved===false?'현재 화면에만 반영 (저장 불가)':'이 브라우저 연습 기록'}`;}catch(e){$('contribution').textContent='점수 등록 실패 · 아래 버튼으로 다시 시도할 수 있습니다.';$('retryScore').hidden=false;}}
  function complete(score){if(!active)return;pending={...active,score};active=null;void submit();}
  $('companySearch').addEventListener('input',search);$('addCompany').addEventListener('click',add);$('companySearch').addEventListener('keydown',e=>{if(e.key==='Enter')add();});
  $('showLeague').addEventListener('click',()=>{$('league').hidden=false;rankings();});$('closeLeague').addEventListener('click',()=>{$('league').hidden=true;});$('refreshLeague').addEventListener('click',rankings);$('retryScore').addEventListener('click',submit);
  window.CompanyLeague={start,complete,rankings};void search();
})();


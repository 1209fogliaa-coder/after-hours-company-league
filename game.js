/* Standalone Canvas arcade. No build step, remote scripts, or server required. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DURATION = 60, MAX_AMMO = 6;
  let width, height, scale, centerX, centerY, angle = -.48;
  let state = 'intro', score = 0, remaining = DURATION, combo = 0, lastHit = -10, elapsed = 0;
  let ammo = MAX_AMMO, best = 0, particles = [], popups = [], shots = [], shake = 0;
  let blocks = [], visibleFaces = [], pointer = null, keys = new Set(), soundOn = false, audio;
  let stage = 1, destroyed = 0, lastFrame = 0;
  const departments=['고객지원팀','영업팀','마케팅팀','인사팀','재무팀','개발팀','디자인팀','전략기획팀','경영지원팀'];
  let departmentStats={}, starting=false;
  function departmentOf(b){return b.kind==='mall'?'매장운영팀':departments[Math.floor(b.row/2)];}
  function announce(b,event){$('departmentName').textContent=departmentOf(b);$('departmentEvent').textContent=`${event} · 게임용 가상 부서`;
    if(event==='구역 파괴!'){const name=departmentOf(b);departmentStats[name]=(departmentStats[name]||0)+1;}}
  async function startRound(){if(starting)return;starting=true;$('start').disabled=true;$('restart').disabled=true;
    try{await window.CompanyLeague.start();begin();}catch(e){$('teamHint').textContent=e.message;$('contribution').textContent=e.message;}
    finally{starting=false;$('start').disabled=false;$('restart').disabled=false;}}
  try { best = Number(localStorage.getItem('lotte-after-hours-best')) || 0; } catch (_) {}
  $('introBest').textContent = String(best).padStart(5, '0');
  const random = (min, max) => min + Math.random() * (max - min);
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  function resize() {
    width = innerWidth; height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const mobile = width <= 760;
    scale = mobile ? Math.min(width / 14, (height - 300) / 14) : Math.min(width / 28, (height - 380) / 14);
    if (state === 'intro') {
      centerX = mobile ? width * .69 : width * .75;
      centerY = mobile ? height * .90 : height * .84;
      scale = mobile ? Math.max(9, Math.min(width / 20, (height - 445) / 14)) : Math.min(width / 28, (height - 180) / 14);
    } else { centerX = width * .5; centerY = height - 125; }
    scale = Math.max(8, scale);
  }
  function project(x, y, z) {
    const rx = x * Math.cos(angle) - z * Math.sin(angle);
    const rz = x * Math.sin(angle) + z * Math.cos(angle);
    return { x: centerX + rx * scale, y: centerY + (rz * .42 - y) * scale, depth: rz };
  }
  function poly(points, fill, stroke) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .7; ctx.stroke(); }
  }
  function quad(points, fill, stroke) { poly(points.map(p => project(...p)), fill, stroke); }
  function makeBuilding() {
    blocks = []; destroyed = 0;
    // Curved, tapering glass shell; each panel is an independently playable target.
    for (let row = 0; row < 18; row++) for (let side = 0; side < 12; side++) {
      const theta = (side + .5) / 12 * Math.PI * 2;
      if (row === 17 && Math.abs(Math.cos(theta)) < .45) continue;
      const y = .4 + row * .68, r = towerRadius(y);
      blocks.push({kind:'tower',row,side,x:Math.cos(theta)*r-.5,y,z:Math.sin(theta)*r-.5,hp:2,fire:0,dead:false,lit:Math.random()>.35});
    }
    for (const [x,z,w,d,h] of [[-4.5,-1.8,2.8,3.4,1.5],[1.6,-2.6,3.3,2.4,1.8],[1.6,.2,3.3,2.1,1.25]])
      for(let i=0;i<3;i++) blocks.push({kind:'mall',x:x+i*w/3,y:.2,z,w:w/3,d,h,hp:2,fire:0,dead:false,lit:true});
  }
  function towerRadius(y) { const t=clamp((y-.4)/12.24,0,1);return 1.55*(1-.27*t-.57*t*t); }
  function towerPoint(y,theta) { const r=towerRadius(y);return [Math.cos(theta)*r,y,Math.sin(theta)*r]; }
  function background(t) {
    const grad = ctx.createLinearGradient(0, 0, 0, height); grad.addColorStop(0, '#10131e'); grad.addColorStop(1, '#181e2a');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(centerX, centerY - scale * 4, 0, centerX, centerY - scale * 4, scale * 10);
    glow.addColorStop(0, '#723e2c26'); glow.addColorStop(1, '#10131c00'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#a1aec1';
    for (let i = 0; i < 65; i++) { const x = (Math.sin(i * 127.1) * .5 + .5) * width, y = (Math.cos(i * 73.3) * .5 + .5) * height * .65; ctx.globalAlpha = .12 + (i % 4) * .07; ctx.fillRect(x, y, 1, 1); } ctx.globalAlpha = 1;
    for (let i = 0; i < 20; i++) { const x = i * width / 18 - 20, h = 25 + (Math.sin(i * 17) * .5 + .5) * height * .16; ctx.fillStyle = '#0c111b'; ctx.fillRect(x, height * .63 - h, width / 22, h + height * .37); ctx.fillStyle = '#d8994d12'; for (let yy = height * .63 - h + 10; yy < height * .63; yy += 15) for (let xx = x + 7; xx < x + width / 22 - 5; xx += 12) ctx.fillRect(xx, yy, 3, 5); }
    for (let n = -15; n <= 15; n++) { const a = project(n, -.1, -15), b = project(n, -.1, 15), c = project(-15, -.1, n), d = project(15, -.1, n); ctx.strokeStyle = '#8192a90b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke(); }
    // Stylized lake and promenade evoke the Jamsil setting, not a geographic map.
    const lake=[];for(let i=0;i<48;i++){const a=i/48*Math.PI*2;lake.push(project(Math.cos(a)*6,-.08,5.6+Math.sin(a)*1.7));}
    poly(lake,'#143e4d','#387180');
    for(let i=0;i<12;i++){const z=4.5+i*.18;quad([[-2+i*.13,-.06,z],[2.5-i*.12,-.06,z],[2.5-i*.12,-.06,z+.025],[-2+i*.13,-.06,z+.025]],'#71a0ad25');}
    quad([[-5.3,0,-3.6],[5.6,0,-3.6],[5.6,0,3.5],[-5.3,0,3.5]], '#343e4b', '#67747b');
    quad([[-5.1,.05,-3.4],[5.4,.05,-3.4],[5.4,.05,3.3],[-5.1,.05,3.3]], '#434b55', '#555967');
    for(let x=-5;x<5;x+=.4)quad([[x,.06,2.7],[x+.18,.06,2.7],[x+.18,.06,3.2],[x,.06,3.2]],'#8a939955');
    // Small landscape planters, decorative only.
    for (const x of [-4.8,-3.6,-2.4,2.4,3.6,4.8]) for (const z of [-3.1,2.5]) { const p = project(x,.2,z); ctx.fillStyle='#131b24'; ctx.beginPath();ctx.ellipse(p.x,p.y,scale*.23,scale*.12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#426357';ctx.beginPath();ctx.arc(p.x,p.y-scale*.25,scale*.2,0,Math.PI*2);ctx.fill(); }
  }
  function facesFor(b) {
    if(b.kind==='tower') {
      const a=b.side/12*Math.PI*2, c=(b.side+1)/12*Math.PI*2, mid=(a+c)/2;
      if(Math.cos(mid)*Math.sin(angle)+Math.sin(mid)*Math.cos(angle)<=0)return [];
      const y0=b.y,y1=y0+.68;
      const crown=b.row===17;
      const topA=crown?y1-.48*(1-Math.abs(Math.cos(a))):y1;
      const topC=crown?y1-.48*(1-Math.abs(Math.cos(c))):y1;
      return [{points:[towerPoint(y0,a),towerPoint(topA,a),towerPoint(topC,c),towerPoint(y0,c)],shade:1,tower:true,a,c,y0,y1,crown}];
    }
    const {x,y,z}=b, X=x+b.w-.025,Y=y+b.h,Z=z+b.d;
    return [
      {points:[[x,y,z],[x,Y,z],[X,Y,z],[X,y,z]], normal:[0,0,-1], shade:0, window:[[x+.17,y+.18,z-.004],[x+.17,Y-.15,z-.004],[X-.17,Y-.15,z-.004],[X-.17,y+.18,z-.004]]},
      {points:[[X,y,Z],[X,Y,Z],[x,Y,Z],[x,y,Z]], normal:[0,0,1], shade:1, window:[[x+.17,y+.18,Z+.004],[x+.17,Y-.15,Z+.004],[X-.17,Y-.15,Z+.004],[X-.17,y+.18,Z+.004]]},
      {points:[[x,y,Z],[x,Y,Z],[x,Y,z],[x,y,z]], normal:[-1,0,0], shade:0, window:[[x-.004,y+.18,z+.17],[x-.004,Y-.15,z+.17],[x-.004,Y-.15,Z-.17],[x-.004,y+.18,Z-.17]]},
      {points:[[X,y,z],[X,Y,z],[X,Y,Z],[X,y,Z]], normal:[1,0,0], shade:1, window:[[X+.004,y+.18,z+.17],[X+.004,Y-.15,z+.17],[X+.004,Y-.15,Z-.17],[X+.004,y+.18,Z-.17]]},
      {points:[[x,Y,z],[x,Y,Z],[X,Y,Z],[X,Y,z]], normal:[0,1,0], shade:2}
    ].filter(f => f.normal[1] || f.normal[0]*Math.sin(angle)+f.normal[2]*Math.cos(angle)>0);
  }
  function building(t) {
    visibleFaces = [];
    const surfaces=[];
    for(const b of blocks.filter(b=>!b.dead))for(const f of facesFor(b)){
      const center=f.points.reduce((v,p)=>v.map((n,i)=>n+p[i]/4),[0,0,0]);
      surfaces.push({b,f,depth:project(...center).depth+center[1]*.02});
    }
    surfaces.sort((a,b)=>a.depth-b.depth);
    for (const {b,f} of surfaces) {
      const points=f.points.map(p=>project(...p));
      if(f.tower){
        const light=(Math.cos((f.a+f.c)/2+angle-1)+1)/2;
        const glass=ctx.createLinearGradient(points[0].x,points[0].y,points[2].x,points[2].y);
        glass.addColorStop(0,`hsl(202 28% ${25+light*25}%)`);glass.addColorStop(.5,`hsl(198 30% ${35+light*30}%)`);glass.addColorStop(1,`hsl(208 25% ${22+light*24}%)`);
        poly(points,b.fire>0?'#ae6038':glass,'#a2c3cd60');
        // Fine horizontal floor bands and continuous vertical mullions.
        for(let k=1;k<=4;k++){
          const yy=f.y0+(f.y1-f.y0)*k/5;
          const a=project(...towerPoint(yy,f.a)),c=project(...towerPoint(yy,f.c));
          ctx.strokeStyle=b.fire?'#ffd181':'#bcd1d654';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
        }
        for(let k=1;k<4;k++){
          const th=f.a+(f.c-f.a)*k/4;
          const top=f.crown?f.y1-.48*(1-Math.abs(Math.cos(th))):f.y1;
          const a=project(...towerPoint(f.y0,th)),c=project(...towerPoint(top,th));
          ctx.strokeStyle=b.fire?'#ffb462':'#cce0e6a0';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
        }
        if(b.lit||b.fire){
          const yy=f.y0+.19;
          quad([towerPoint(yy,f.a+.06),towerPoint(yy+.10,f.a+.06),towerPoint(yy+.10,f.c-.06),towerPoint(yy,f.c-.06)],b.fire?'#ffbc58':'#f8e0a86a');
        }
        if(b.side===2||b.side===8){
          const a=project(...towerPoint(f.y0,f.c)),c=project(...towerPoint(f.y1,f.c));ctx.strokeStyle='#172938';ctx.lineWidth=Math.max(1.5,scale*.07);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
        }
      } else {
        poly(points,b.fire>0 ? ['#63362d','#854333','#a65a39'][f.shade] : ['#aaa59a','#c9bfa9','#7c888d'][f.shade], '#5f6669');
        if(f.shade!==2){
          const mid={x:(points[0].x+points[2].x)/2,y:(points[0].y+points[2].y)/2};
          poly([points[0],points[1],mid],b.fire?'#c16a35':'#e6d7b2');poly([points[2],points[3],mid],b.fire?'#8b452b':'#9a9e9a');
        }else{poly([points[0],points[1],{x:points[2].x*.7+points[0].x*.3,y:points[2].y*.7+points[0].y*.3}], '#a4c0c166');}
      }
      if (f.window) { const glow=b.fire>0 ? ['#ff6b31','#ffb34d','#ffe098'][Math.floor(t*11+b.x+b.y+20)%3] : b.lit ? ['#9c7850','#c3a370'][f.shade] : '#202e42'; quad(f.window,glow); }
      visibleFaces.push({b,points});
    }
    if (destroyed < blocks.length * .65) {
      const p = project(0,13.3,0); ctx.textAlign='center'; ctx.font=`600 ${Math.max(10,scale*.30)}px Arial`; ctx.fillStyle='#d9e7ee';ctx.fillText('LOTTE WORLD TOWER',p.x,p.y);ctx.font=`${Math.max(7,scale*.17)}px Arial`;ctx.fillStyle='#91aebd';ctx.fillText('JAMSIL / LANDMARK EDITION',p.x,p.y+scale*.34);
      const mall=project(3.1,2.2,.2);ctx.font=`800 ${Math.max(8,scale*.24)}px Arial`;ctx.fillStyle='#ff7368';ctx.fillText('LOTTE WORLD MALL',mall.x,mall.y);
    }
  }
  function inside(p, pts) { let hit=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x))hit=!hit;}return hit; }
  function burst(b,count=12) { for(let i=0;i<count;i++) particles.push({x:b.x+.5,y:b.y+.5,z:b.z+.5,vx:random(-1.8,1.8),vy:random(1,4),vz:random(-1.8,1.8),life:random(.3,1),max:1,size:random(.04,.14),type:'spark'}); }
  function tone(freq, duration=.12) {
    if(!soundOn || !audio) return;
    try {const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.3,audio.currentTime+duration);g.gain.setValueAtTime(.07,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);} catch (_) {}
  }
  function hitAt(x,y) {
    if(state!=='playing' || ammo<1) return;
    let target=null;for(let i=visibleFaces.length-1;i>=0;i--) if(!visibleFaces[i].b.dead&&inside({x,y},visibleFaces[i].points)){target=visibleFaces[i].b;break;}
    if(!target) { combo=0; return; }
    ammo-=1;
    shots.push({from:{x:width*.5,y:height+10},to:{x,y},life:0,max:.17});
    combo = elapsed-lastHit<1.5 ? combo+1 : 1; lastHit=elapsed;
    const multiplier=Math.min(5,1+Math.floor(combo/4));
    const points=100*multiplier;score+=points;target.hp--;target.fire=1;
    announce(target,'불꽃 명중!');
    burst(target);tone(180+combo*25);shake=reducedMotion?0:3;
    popups.push({x,y,text:`+${points}`,life:1,color:'#ffe5a8'});
    if(target.hp<=0) destroy(target,true);
    updateHUD();
  }
  function destroy(b,direct=false) {
    if(b.dead)return;b.dead=true;destroyed++;score+=direct?150:50;burst(b,18);shake=reducedMotion?0:5;
    announce(b,'구역 파괴!');
  }
  function updateHUD() {
    $('score').textContent=String(score).padStart(5,'0');$('time').innerHTML=`${Math.ceil(remaining)}<span>s</span>`;
    $('timeBar').style.width=`${remaining/DURATION*100}%`;$('damage').innerHTML=`${Math.round(destroyed/blocks.length*100)}<span>%</span>`;
    $('combo').hidden=combo<4||state!=='playing';$('combo').firstElementChild.textContent=`COMBO ×${Math.min(5,1+Math.floor(combo/4))}`;
    $('shots').textContent=ammo<1?'불꽃 충전 중…':`불꽃 ${'●'.repeat(Math.floor(ammo))}${'○'.repeat(MAX_AMMO-Math.floor(ammo))}`;
  }
  function begin() {
    departmentStats={};$('department').hidden=false;$('departmentName').textContent='공통 도전 맵';$('departmentEvent').textContent='부서 배치는 게임용입니다';$('departmentReport').textContent='';$('backLobby').hidden=true;
    state='playing';score=0;remaining=DURATION;elapsed=0;combo=0;lastHit=-10;ammo=MAX_AMMO;particles=[];popups=[];shots=[];stage=1;angle=-.48;
    makeBuilding();$('intro').hidden=true;$('modal').hidden=true;$('hud').hidden=false;$('pause').hidden=false;$('playHelp').hidden=false;resize();updateHUD();
  }
  function finish() {
    if(state!=='playing')return;
    state='over';$('modalLabel').textContent='SHIFT COMPLETE';$('modalTitle').textContent='퇴근 완료.';
    $('modalText').textContent=`${stage}번째 오피스 · 파괴율 ${Math.round(destroyed/blocks.length*100)}%`;
    $('finalScore').textContent=`${score.toLocaleString()} PTS`;$('bestNotice').textContent=score>best?'NEW BEST! 오늘 가장 화끈한 퇴근.':`최고 기록 ${best.toLocaleString()} PTS`;
    if(score>best){best=score;try{localStorage.setItem('lotte-after-hours-best',String(best));}catch(_){} }
    $('resume').hidden=true;$('restart').classList.remove('secondary');$('restart').textContent='한 번 더 퇴근하기 ↗';$('modal').hidden=false;$('pause').hidden=true;$('combo').hidden=true;
    $('departmentReport').textContent=Object.entries(departmentStats).sort((a,b)=>b[1]-a[1]).map(([name,count])=>`${name} ${count}구역`).join(' · ')||'파괴한 부서 구역이 없습니다.';
    $('departmentReport').hidden=false;$('contribution').hidden=false;$('backLobby').hidden=false;window.CompanyLeague.complete(score);
  }
  function pause() {
    if(state!=='playing')return;state='paused';keys.clear();pointer=null;
    $('departmentReport').hidden=true;$('contribution').hidden=true;
    $('modalLabel').textContent='TAKE A BREATH';$('modalTitle').textContent='잠깐 쉬어가기';$('modalText').textContent='남은 시간은 그대로예요.';$('finalScore').textContent='';$('bestNotice').textContent='';$('resume').hidden=false;$('restart').classList.add('secondary');$('restart').textContent='처음부터 다시';$('modal').hidden=false;$('combo').hidden=true;
  }
  function resume(){if(state!=='paused')return;state='playing';$('modal').hidden=true;updateHUD();}
  function update(dt) {
    if(state!=='playing')return;
    elapsed+=dt;remaining=Math.max(0,remaining-dt);ammo=Math.min(MAX_AMMO,ammo+dt*4.5);
    if(keys.has('ArrowLeft')||keys.has('a'))angle-=dt*.9;if(keys.has('ArrowRight')||keys.has('d'))angle+=dt*.9;
    if(elapsed-lastHit>1.5)combo=0;
    for(const b of blocks){if(b.dead||!b.fire)continue;b.fire+=dt;
      if(Math.random()<dt*12)particles.push({x:b.x+random(.1,.9),y:b.y+.5,z:b.z+random(.1,.9),vx:random(-.2,.2),vy:random(.6,1.6),vz:0,life:random(.5,1.4),max:1.4,size:random(.08,.25),type:Math.random()<.4?'smoke':'flame'});
      if(b.fire>3.8)destroy(b);
    }
    if(destroyed===blocks.length){score+=2000;stage++;makeBuilding();popups.push({x:width*.5,y:height*.4,text:'ALL CLEAR +2000',life:2,color:'#ff9c73'});ammo=MAX_AMMO;}
    updateHUD();if(remaining<=0)finish();
  }
  function effects(dt) {
    for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.type==='spark')p.vy-=dt*5;const v=project(p.x,p.y,p.z);ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.type==='smoke'?'#81818b':p.type==='flame'?'#ff8037':'#ffd18a';ctx.beginPath();ctx.arc(v.x,v.y,Math.max(0.1,p.size*scale*(p.type==='smoke'?2:1)),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0).slice(-650);
    for(const s of shots){s.life+=dt;const t=Math.min(1,s.life/s.max);const x=s.from.x+(s.to.x-s.from.x)*t,y=s.from.y+(s.to.y-s.from.y)*t;ctx.strokeStyle='#ff7738';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-(s.to.x-s.from.x)*.07,y-(s.to.y-s.from.y)*.07);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle='#ffdf8a';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}shots=shots.filter(s=>s.life<s.max);
    ctx.textAlign='center';for(const p of popups){p.life-=dt;p.y-=dt*30;ctx.globalAlpha=Math.min(1,Math.max(0,p.life));ctx.fillStyle=p.color;ctx.font="700 22px 'Barlow Condensed',sans-serif";ctx.fillText(p.text,p.x,p.y);}ctx.globalAlpha=1;popups=popups.filter(p=>p.life>0);
  }
  function frame(ms){const dt=Math.min(.05,(ms-lastFrame)/1000||0);lastFrame=ms;update(dt);if(state==='intro'&&!reducedMotion)angle+=dt*.055;
    ctx.save();if(shake>0){ctx.translate(random(-shake,shake),random(-shake,shake));shake=Math.max(0,shake-dt*30);}background(ms/1000);building(state==='paused'?elapsed:ms/1000);effects(state==='paused'?0:dt);ctx.restore();requestAnimationFrame(frame);
  }
  canvas.addEventListener('pointerdown',e=>{if(state!=='playing')return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,moved:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>9)pointer.moved=true;if(pointer.moved)angle+=(e.clientX-pointer.lastX)*.008;pointer.lastX=e.clientX;});
  canvas.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;if(!pointer.moved)hitAt(e.clientX,e.clientY);pointer=null;});
  canvas.addEventListener('pointercancel',()=>pointer=null);
  window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','a','d'].includes(e.key)&&state==='playing'){e.preventDefault();keys.add(e.key);}if(e.key==='Escape'){if(state==='playing')pause();else if(state==='paused')resume();}});
  window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>{keys.clear();pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  $('start').addEventListener('click',startRound);$('restart').addEventListener('click',startRound);$('pause').addEventListener('click',pause);$('resume').addEventListener('click',resume);
  $('backLobby').addEventListener('click',()=>{state='intro';$('modal').hidden=true;$('intro').hidden=false;$('hud').hidden=true;$('department').hidden=true;$('playHelp').hidden=true;$('introBest').textContent=String(best).padStart(5,'0');makeBuilding();resize();});
  $('sound').addEventListener('click',()=>{try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();audio.resume();soundOn=!soundOn;$('sound').textContent=soundOn?'소리 ON':'소리 OFF';$('sound').setAttribute('aria-label',soundOn?'소리 끄기':'소리 켜기');$('sound').setAttribute('aria-pressed',String(soundOn));tone(440);}catch(_){$('sound').textContent='소리 미지원';}});
  window.addEventListener('resize',resize);makeBuilding();resize();requestAnimationFrame(frame);
})();

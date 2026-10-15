(function(){
const $=s=>document.querySelector(s);
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const hhmm=d=>pad(d.getHours())+':'+pad(d.getMinutes());
const dur=h=>{const m=Math.round((+h||0)*60);return Math.floor(m/60)+':'+pad(m%60)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LEAVE=['Annual leave','Sick leave','Public holiday','Unpaid leave'];
const isLeave=l=>LEAVE.includes(l);
const normLoc=l=>l==='Out of office'?'Field work':l==='Time off'?'Annual leave':(l||'Office');
const LOCVAR={'Office':'var(--office)','Home':'var(--home)','Field work':'var(--field)'};
const PCOL=['#5E82C2','#4F9A7C','#C06A90','#A47C3E','#7E6BC4','#C97A62','#4A8EA3','#7F8C45'];
const pcol=p=>{let h=0;for(const c of p) h=(h*31+c.charCodeAt(0))>>>0;return PCOL[h%PCOL.length]};
const spanH=(s,e)=>{if(!s||!e) return null;const[a,b]=s.split(':').map(Number),[c,d]=e.split(':').map(Number);let m=(c*60+d)-(a*60+b);if(m<=0) m+=1440;return Math.round(m/60*100)/100};

const state={tview:store.get('tt.tview')||'day',tab:store.get('tt.tab')||'tracker',person:store.get('tt.person')||'me',anchor:new Date(),wkDays:Number(store.get('tt.wkdays')||5),rperiod:'week',
  manual:store.get('tt.manual')==='1',uid:null,rows:new Map(),loaded:new Set(),loading:new Set(),members:new Set(),names:{},profiles:[],invites:[],isAdmin:false,canViewAll:false,timer:null,canWrite:true,editing:null,vname:''};
const CFG=window.TIMESHEET_CONFIG||{};
const sb=(CFG.supabaseUrl&&CFG.supabaseAnonKey&&window.supabase)?window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey):null;

/* ---------- data ---------- */
const fromRow=r=>({id:r.id,uid:r.user_id,date:r.date,task:r.task||'',notes:r.notes||'',project:r.project||'',location:normLoc(r.location),start:r.start_time||'',end:r.end_time||'',hours:+r.hours||0,created:Date.parse(r.created_at)||0});
const toRow=e=>({date:e.date,task:e.task,notes:e.notes||null,project:e.project||null,location:e.location,start_time:e.start||null,end_time:e.end||null,hours:+e.hours||0});
function allEntries(){return [...state.rows.values()];}
function visible(){const a=allEntries();if(state.person==='all') return a;const w=state.person==='me'?state.uid:state.person;return a.filter(e=>e.uid===w);}
function range(){
  const a=new Date(state.anchor.getFullYear(),state.anchor.getMonth(),state.anchor.getDate());
  if(state.tab==='month'||(state.tab==='reports'&&state.rperiod==='month')) return [new Date(a.getFullYear(),a.getMonth(),1),new Date(a.getFullYear(),a.getMonth()+1,0)];
  if(isDayMode()) return [a,a];
  const s=addDays(a,-a.getDay());return [s,addDays(s,state.wkDays-1)];
}
const inRange=(l,[s,e])=>{const a=iso(s),b=iso(e);return l.filter(x=>x.date>=a&&x.date<=b)};
const nameOf=id=>id===state.uid?'You':(state.names[id]||'Teammate');
const findMine=id=>{const e=state.rows.get(id);return e&&e.uid===state.uid?e:null;};
const newId=()=>(crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);}));
const monthKey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1);
function monthsIn([s,e]){const out=[];let d=new Date(s.getFullYear(),s.getMonth(),1);while(d<=e){out.push(monthKey(d));d=new Date(d.getFullYear(),d.getMonth()+1,1);}return out;}
async function fetchMonth(mk){
  if(state.loading.has(mk)) return;state.loading.add(mk);
  try{
    const[y,m]=mk.split('-').map(Number);const from=mk+'-01',to=iso(new Date(y,m,0));
    let all=[],i=0;
    for(;;){const{data,error}=await sb.from('entries').select('*').gte('date',from).lte('date',to).order('date').order('id').range(i,i+999);
      if(error) throw error;all=all.concat(data||[]);if(!data||data.length<1000) break;i+=1000;}
    for(const[id,e] of state.rows) if(e.date.slice(0,7)===mk) state.rows.delete(id);
    all.forEach(r=>state.rows.set(r.id,fromRow(r)));state.loaded.add(mk);
  }catch(err){state.loaded.add(mk);showBanner('Could not load your time. Check your connection, then refresh the page.');}
  finally{state.loading.delete(mk);}
}
async function ensureLoaded(){
  if(!sb||!state.uid||state.tab==='team'||state.tab==='todo') return;
  const need=monthsIn(range()).filter(mk=>!state.loaded.has(mk)&&!state.loading.has(mk));
  if(!need.length) return;
  await Promise.all(need.map(fetchMonth));render();
}
async function refreshLoaded(){const mks=[...state.loaded];state.loaded.clear();await Promise.all(mks.map(fetchMonth));render();}
function throwIf(error){if(error){const e=new Error(error.message);e.db=error;throw e;}}
async function addEntries(list){
  list.forEach(e=>{e.uid=state.uid;state.rows.set(e.id,e);});render();
  const{error}=await sb.from('entries').insert(list.map(e=>({id:e.id,user_id:state.uid,...toRow(e)})));
  if(error){list.forEach(e=>state.rows.delete(e.id));render();throwIf(error);}
}
const addEntry=e=>addEntries([e]);
async function updateEntry(id,ch){
  const old=state.rows.get(id);if(!old) return;const nu={...old,...ch};state.rows.set(id,nu);render();
  const{error}=await sb.from('entries').update(toRow(nu)).eq('id',id);
  if(error){state.rows.set(id,old);render();throwIf(error);}
}
async function deleteEntry(id){
  const old=state.rows.get(id);state.rows.delete(id);render();
  const{error}=await sb.from('entries').delete().eq('id',id);
  if(error){if(old) state.rows.set(id,old);render();throwIf(error);}
}
function fillPeople(){
  $('#person-wrap').hidden=!state.canViewAll;
  const sel=$('#person'),cur=state.person;sel.innerHTML='<option value="me">My time</option><option value="all">Everyone</option>';
  for(const p of state.profiles){if(p.id===state.uid) continue;const o=document.createElement('option');o.value=p.id;o.textContent=p.full_name||p.email;sel.appendChild(o);}
  sel.value=[...sel.options].some(o=>o.value===cur)?cur:'me';state.person=state.canViewAll?sel.value:'me';}
async function loadPeople(){
  const{data}=await sb.from('profiles').select('*').order('full_name');
  state.profiles=data||[];state.names={};state.profiles.forEach(p=>state.names[p.id]=p.full_name||p.email);
  if(state.isAdmin){const r=await sb.from('allowed_emails').select('*').order('invited_at');state.invites=r.data||[];}
  fillPeople();render();
}
function showBanner(t){const b=$('#banner');b.textContent=t;b.hidden=false;}
function guard(){if(!state.canWrite){showBanner('Your access to this timesheet has been turned off. Ask Amira if you think this is a mistake.');return false;}return true;}

/* ---------- timer ---------- */
async function setTimer(t){state.timer=t;paintTimer();
  if(!t){const{error}=await sb.from('timers').delete().eq('user_id',state.uid);throwIf(error);return;}
  const{error}=await sb.from('timers').upsert({user_id:state.uid,started_at:new Date(t.startedAt).toISOString(),task:t.task||null,project:t.project||null,location:t.location||'Office',notes:t.notes||null});throwIf(error);}
const timerFromRow=r=>r?{running:true,startedAt:Date.parse(r.started_at),task:r.task||'',project:r.project||'',location:normLoc(r.location),notes:r.notes||''}:null;
function paintTimer(){
  const t=state.timer&&state.timer.running?state.timer:null;
  const go=$('#go');
  if(state.manual){go.textContent='Add';go.classList.remove('stop');}
  else{go.textContent=t?'Stop':'Start';go.classList.toggle('stop',!!t);}
  if(t&&!state.manual&&document.activeElement!==$('#t-task')){
    if($('#t-task').value!==t.task) $('#t-task').value=t.task||'';
    if($('#t-project').value!==(t.project||'')) $('#t-project').value=t.project||'';
    $('#t-loc').value=t.location||'Office';
    if($('#t-notes').value!==(t.notes||'')) $('#t-notes').value=t.notes||'';
  }
  tick();
}
function tick(){const t=state.timer&&state.timer.running?state.timer:null;
  let s=t?Math.max(0,Math.floor((Date.now()-t.startedAt)/1000)):0;
  $('#clock').textContent=pad(Math.floor(s/3600))+':'+pad(Math.floor(s/60)%60)+':'+pad(s%60);
  document.title=t&&!state.manual?$('#clock').textContent+' · '+(t.task||'Timer'):"Amira's Timesheet Tracker";}
setInterval(()=>{if(state.timer&&state.timer.running) tick();},1000);
async function stopTimer(){
  const t=state.timer;if(!t||!t.running) return;
  const st=new Date(t.startedAt),en=new Date();
  const hours=Math.max(0.01,Math.round((en-st)/36e5*100)/100);
  const e={id:newId(),date:iso(st),task:($('#t-task').value.trim()||t.task||'Untitled'),project:$('#t-project').value.trim(),location:$('#t-loc').value,notes:$('#t-notes').value.trim(),start:hhmm(st),end:hhmm(en),hours,created:Date.now()};
  await setTimer(null);await addEntry(e);clearBar();
}
async function startTimer(task,project,location,notes){
  if(state.timer&&state.timer.running) await stopTimer();
  await setTimer({running:true,startedAt:Date.now(),task,project,location,notes});
}
function clearBar(){$('#t-task').value='';$('#t-notes').value='';$('#t-project').value='';$('#t-loc').value='Office';syncManual();}

/* live-sync edits to a running timer (description/project), debounced */
let tdeb=null;
['#t-task','#t-project','#t-loc','#t-notes'].forEach(s=>$(s).addEventListener('input',()=>{
  if(state.manual||!state.timer||!state.timer.running) return;
  clearTimeout(tdeb);tdeb=setTimeout(()=>{const t={...state.timer,task:$('#t-task').value.trim(),project:$('#t-project').value.trim(),location:$('#t-loc').value,notes:$('#t-notes').value.trim()};setTimer(t).catch(()=>{});},800);
}));

$('#timer').addEventListener('submit',async ev=>{
  ev.preventDefault();if(!guard()) return;const go=$('#go');go.disabled=true;
  try{
    const task=$('#t-task').value.trim(),project=$('#t-project').value.trim(),location=$('#t-loc').value,notes=$('#t-notes').value.trim();
    if(state.manual){
      const date=$('#t-date').value||iso(new Date());
      if(isLeave(location)){await addEntry({id:newId(),date,task:task||location,project,location,notes,start:'',end:'',hours:0,created:Date.now()});}
      else{
        const s=$('#t-start').value,e=$('#t-end').value,h=spanH(s,e);
        if(!h){showBanner('Add a start and end time to log this entry.');return;}
        if(!task){showBanner('Add a task name first, for example "Bank visit".');$('#t-task').focus();return;}
        await addEntry({id:newId(),date,task,project,location,notes,start:s,end:e,hours:h,created:Date.now()});
      }
      $('#banner').hidden=true;state.anchor=parse(date);clearBar();
    }else{
      if(state.timer&&state.timer.running) await stopTimer();
      else{if(isLeave(location)){showBanner('Switch to manual mode (the list icon) to log leave or a holiday.');return;}
        await startTimer(task,project,location,notes);$('#banner').hidden=true;}
    }
  }catch(err){showBanner('That did not save. Check your connection and try again.');}
  finally{go.disabled=false;}
});
function syncManual(){
  $('#seg-timer').hidden=state.manual;$('#seg-manual').hidden=!state.manual;
  $('#m-timer').setAttribute('aria-pressed',String(!state.manual));$('#m-manual').setAttribute('aria-pressed',String(state.manual));
  const lv=isLeave($('#t-loc').value);['#t-start','#t-end'].forEach(s=>$(s).disabled=lv);
  if(!$('#t-date').value) $('#t-date').value=iso(new Date());
  const h=spanH($('#t-start').value,$('#t-end').value);$('#t-dur').textContent=lv?'Off':h?dur(h):'0:00';
  paintTimer();
}
$('#m-timer').onclick=()=>{state.manual=false;store.set('tt.manual','0');syncManual();};
$('#m-manual').onclick=()=>{state.manual=true;store.set('tt.manual','1');syncManual();};
['#t-start','#t-end','#t-loc'].forEach(s=>$(s).addEventListener('change',syncManual));

/* ---------- render ---------- */
function locTag(l){return isLeave(l)?`<span class="loc leave">${esc(l)}</span>`:`<span class="loc" style="--lc:${LOCVAR[l]||'var(--office)'}">${esc(l)}</span>`;}
function projTag(p){return p?`<span class="proj" style="--pc:${pcol(p)}">${esc(p)}</span>`:'';}
const ICON_PLAY='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_EDIT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>';
function dayLabel(ds){const t=iso(new Date()),y=iso(addDays(new Date(),-1));const d=parse(ds);
  return ds===t?'Today':ds===y?'Yesterday':DN[d.getDay()]+', '+MN[d.getMonth()]+' '+d.getDate();}
function isDayMode(){return (state.tab==='tracker'&&state.tview==='day')||state.tab==='dayview';}
function render(){
  document.querySelectorAll('.navbtn').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===state.tab?'page':'false'));
  if(state.tab==='team'&&!state.isAdmin) state.tab='tracker';
  ['tracker','calendar','month','reports','team','todo'].forEach(t=>$('#v-'+t).hidden=(state.tab==='dayview'?'calendar':state.tab)!==t);
  const side=state.tab==='team'||state.tab==='todo';
  $('.toolbar').hidden=side;$('.foot2').hidden=side;
  if(state.tab==='team'){renderTeam();return;}
  if(state.tab==='todo'){renderTodo();return;}
  ensureLoaded();
  $('#rperiod').hidden=state.tab!=='reports';
  $('#tview').hidden=state.tab!=='tracker';
  document.querySelectorAll('#tview button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tv===state.tview)));
  if(isDayMode()&&document.activeElement!==$('#t-date')) $('#t-date').value=iso(range()[0]);
  const r=range(),list=inRange(visible(),r),showWho=state.person==='all';
  const tw=iso(addDays(new Date(),-new Date().getDay()));
  $('#plabel').textContent=(isDayMode())?dayLabel(iso(r[0])):(state.tab==='month'||(state.tab==='reports'&&state.rperiod==='month'))?(MN[r[0].getMonth()]+' '+r[0].getFullYear()):(iso(r[0])===tw?'This week':MN[r[0].getMonth()]+' '+r[0].getDate()+' to '+MN[r[1].getMonth()]+' '+r[1].getDate());
  $('#ptotal').textContent=dur(list.reduce((t,e)=>t+(+e.hours||0),0));
  $('#projects').innerHTML=[...new Set(allEntries().map(e=>e.project).filter(Boolean))].sort().map(p=>`<option value="${esc(p)}"></option>`).join('');
  if(state.tab==='tracker') renderTracker(list,showWho,r);
  if(state.tab==='calendar'||state.tab==='dayview') renderCal(list,showWho,r);
  if(state.tab==='month') renderMonth(list,showWho,r);
  if(state.tab==='reports') renderReports(list,r);
}
function renderTracker(list,showWho){
  const by={};list.forEach(e=>(by[e.date]=by[e.date]||[]).push(e));
  const days=Object.keys(by).sort().reverse();
  if(!days.length&&state.tview==='day'){$('#v-tracker').innerHTML=`<div class="daygrp"><div class="empty"><b>Nothing logged for this day</b>Press Start to time what you're doing, use the list icon to add a block of time, or tap "Log my usual day".</div></div>`;return;}
  if(!days.length){$('#v-tracker').innerHTML=`<div class="daygrp"><div class="empty"><b>No time logged this week</b>Type what you're working on above and press Start, or switch to manual mode (the list icon) to add a block of time. "Log my usual day" adds your office and home hours in one tap.</div></div>`;return;}
  $('#v-tracker').innerHTML=days.map(ds=>{
    const es=by[ds].slice().sort((a,b)=>(b.start||'')<(a.start||'')?-1:(b.start||'')>(a.start||'')?1:0);
    const tot=es.reduce((t,e)=>t+(+e.hours||0),0);const lv=!showWho&&es.some(e=>isLeave(e.location));
    return `<div class="daygrp${lv?' leave':''}"><div class="dayhead"><span class="d">${dayLabel(ds)}</span><span class="t">${lv&&!tot?'Day off':'Total'}<b>${lv&&!tot?'':dur(tot)}</b></span></div>`+
      es.map(e=>{const mine=e.uid===state.uid,lvE=isLeave(e.location);
        return `<div class="row"><div class="desc"><b>${esc(e.task)}</b>${e.notes?`<span>${esc(e.notes)}</span>`:''}</div>
        <div class="tags">${projTag(e.project)}${locTag(e.location)}${showWho?`<span class="who">${esc(nameOf(e.uid))}</span>`:''}</div>
        <span class="span">${e.start&&e.end?esc(e.start)+' - '+esc(e.end):''}</span>
        <span class="dur">${lvE?'Off':dur(e.hours)}</span>
        <span class="acts">${mine&&!lvE?`<button type="button" data-play="${esc(e.id)}" data-date="${esc(e.date)}" aria-label="Continue this task" title="Continue">${ICON_PLAY}</button>`:''}${mine?`<button type="button" data-edit="${esc(e.id)}" data-date="${esc(e.date)}" aria-label="Edit entry" title="Edit">${ICON_EDIT}</button>`:''}</span></div>`;}).join('')+`</div>`;
  }).join('');
}
function renderCal(list,showWho,r){
  const n=state.tab==='dayview'?1:state.wkDays;const PX=state.tab==='dayview'?56:40;
  const timed=list.filter(e=>e.start&&e.end&&!isLeave(e.location));
  let lo=9,hi=24;timed.forEach(e=>{const s=+e.start.slice(0,2);lo=Math.min(lo,s);});lo=Math.max(0,lo);
  const H=(hi-lo)*PX;const t=iso(new Date());
  let h=`<div class="hcell" style="border-left:0"></div>`;
  for(let i=0;i<n;i++){const d=addDays(r[0],i),ds=iso(d);const tot=list.filter(e=>e.date===ds).reduce((a,e)=>a+(+e.hours||0),0);
    h+=`<div class="hcell${ds===t?' today':''}">${DN[d.getDay()]} ${d.getDate()}<b>${dur(tot)}</b></div>`;}
  let g=`<div class="gutter" style="height:${H}px">`;for(let x=lo;x<=hi;x++) g+=`<span style="top:${(x-lo)*PX}px">${pad(x%24)}:00</span>`;g+='</div>';
  let cols='';
  for(let i=0;i<n;i++){const d=addDays(r[0],i),ds=iso(d);const es=list.filter(e=>e.date===ds);const lv=!showWho&&es.some(e=>isLeave(e.location));
    let c=`<div class="col${lv?' leave':''}" data-day="${ds}" style="height:${H}px">`;
    for(let x=1;x<hi-lo;x++) c+=`<div class="line" style="top:${x*PX}px"></div>`;
    es.forEach(e=>{
      if(isLeave(e.location)){c+=`<div class="blk leave">${esc(e.location)}</div>`;return;}
      if(!e.start||!e.end) return;
      const[sh,sm]=e.start.split(':').map(Number);let top=((sh+sm/60)-lo)*PX;let ht=Math.max(18,(+e.hours||0)*PX);
      if(top+ht>H) ht=H-top;
      c+=`<button type="button" class="blk" style="top:${top}px;height:${ht}px;--lc:${LOCVAR[e.location]||'var(--office)'}" ${e.uid===state.uid?`data-edit="${esc(e.id)}" data-date="${esc(e.date)}"`:''} title="${esc(e.task)} ${esc(e.start)} to ${esc(e.end)}"><b>${esc(e.task)}</b>${esc(e.start)} - ${esc(e.end)}${showWho?' · '+esc(nameOf(e.uid)):''}${n===1&&e.project?' · '+esc(e.project):''}${n===1&&e.notes?'<br>'+esc(e.notes):''}</button>`;
    });
    if(ds===t){const now=new Date();const y=((now.getHours()+now.getMinutes()/60)-lo)*PX;if(y>=0&&y<=H) c+=`<div class="now" style="top:${y}px"></div>`;}
    cols+=c+'</div>';}
  const cal=$('#cal');cal.style.gridTemplateColumns=`52px repeat(${n},minmax(0,1fr))`;cal.style.minWidth=n===1?'0':'';cal.innerHTML=h+g+cols;
}
function renderMonth(list,showWho,r){
  const n=state.wkDays,g=$('#mgrid');g.style.setProperty('--cols',n);
  const t=iso(new Date()),mon=r[0].getMonth();
  let h='';for(let i=0;i<n;i++) h+=`<div class="mh">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i]}</div>`;
  for(let w=addDays(r[0],-r[0].getDay());w<=r[1];w=addDays(w,7)){
    for(let i=0;i<n;i++){
      const d=addDays(w,i),ds=iso(d);
      if(d.getMonth()!==mon){h+=`<div class="mc out" aria-hidden="true"><div class="top"><span class="n">${d.getDate()}</span></div></div>`;continue;}
      const es=list.filter(e=>e.date===ds).sort((a,b)=>(a.start||'99')<(b.start||'99')?-1:1);
      const tot=es.reduce((a,e)=>a+(+e.hours||0),0);const lv=!showWho&&es.some(e=>isLeave(e.location));
      const items=es.map(e=>{
        if(isLeave(e.location)) return `<span class="mt lv" title="${esc(e.notes||'')}">${esc(e.location)}</span>`;
        const mine=e.uid===state.uid;const tip=[e.task,e.start&&e.end?e.start+' to '+e.end:'',e.project,e.notes].filter(Boolean).join(' | ');
        return `<button type="button" class="mt${mine?'':' who'}" style="--lc:${LOCVAR[e.location]||'var(--office)'}" ${mine?`data-edit="${esc(e.id)}" data-date="${esc(e.date)}"`:''} title="${esc(tip)}">${esc(e.task)}<small>${dur(e.hours)}${showWho?' · '+esc(nameOf(e.uid)):''}</small></button>`;}).join('');
      h+=`<div class="mc${ds===t?' today':''}${lv?' leave':''}${es.length?'':' empty-m'}" data-mday="${ds}"><div class="top"><span class="n">${d.getDate()}</span><span class="wd">${DN[d.getDay()]}</span><span class="h">${tot?dur(tot):''}</span></div>${items}</div>`;
    }
  }
  g.innerHTML=h;
  if(!list.length) g.insertAdjacentHTML('afterend','');
}
function renderTeam(){
  const byEmail={};state.profiles.forEach(p=>byEmail[p.email]=p);
  const emails=new Set([...state.invites.map(i=>i.email),...state.profiles.map(p=>p.email)]);
  const rows=[...emails].map(em=>{const inv=state.invites.find(i=>i.email===em),p=byEmail[em];
    const name=(p&&p.full_name)||(inv&&inv.full_name)||em;const src=inv||p||{};const role=src.is_admin?'admin':src.can_view_all?'viewer':'member';const admin=role==='admin';
    const status=p&&!p.active?'off':!inv?'off':p?'on':'wait';
    return {em,name,admin,role,status,p};}).sort((a,b)=>a.name.localeCompare(b.name));
  $('#team-list').innerHTML=rows.length?rows.map(x=>`<div class="person-row"><div><b>${esc(x.name)}${x.p&&x.p.id===state.uid?' (you)':''}</b><span class="e">${esc(x.em)}</span></div>
    ${x.p&&x.p.id===state.uid?'<span class="badge">Admin</span>':x.status==='off'?'<span class="badge off">Removed</span>':`<span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${x.status==='wait'?'<span class="badge wait">Invited</span>':''}<select data-role="${esc(x.em)}" aria-label="Role for ${esc(x.name)}"><option value="member"${x.role==='member'?' selected':''}>Member</option><option value="viewer"${x.role==='viewer'?' selected':''}>Viewer</option><option value="admin"${x.role==='admin'?' selected':''}>Admin</option></select></span>`}
    <span class="acts2">${x.p&&x.p.id===state.uid?'':x.status==='off'?`<button class="btn" type="button" data-reinvite="${esc(x.em)}" data-name="${esc(x.name)}">Restore access</button>`:`${x.status==='wait'?`<button class="btn" type="button" data-resend="${esc(x.em)}">Resend link</button>`:''}<button class="btn danger" type="button" data-remove="${esc(x.em)}">Remove</button>`}</span></div>`).join(''):'<p class="hint">No one invited yet.</p>';
}
async function sendLink(email){const{error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname}});return error;}
$('#invite').addEventListener('submit',async ev=>{
  ev.preventDefault();const name=$('#i-name').value.trim(),email=$('#i-email').value.trim().toLowerCase(),role=$('#i-role').value,admin=role==='admin',viewer=role!=='member';const msg=$('#i-msg');
  if(!name||!email) return;$('#i-go').disabled=true;msg.hidden=false;msg.textContent='Sending...';
  try{
    const{error}=await sb.from('allowed_emails').upsert({email,full_name:name,is_admin:admin,can_view_all:viewer});if(error&&/can_view_all/.test(error.message)) throw new Error('the Viewer role needs a one-time database update (supabase/roles.sql)');throwIf(error);
    await sb.from('profiles').update({active:true,is_admin:admin,can_view_all:viewer,full_name:name}).eq('email',email);
    const le=await sendLink(email);
    msg.textContent=le?`${name} is invited, but the email could not be sent right now (${le.message}). Send them this link and ask them to sign in with ${email}: ${location.origin+location.pathname}`:`Invite sent. ${name} will get an email with a sign-in link.`;
    $('#invite').reset();await loadPeople();
  }catch(err){msg.textContent='The invite did not go through: '+err.message;}
  finally{$('#i-go').disabled=false;}
});
document.addEventListener('click',async e=>{
  const rm=e.target.closest('[data-remove]');
  if(rm){if(rm.dataset.sure!=='1'){rm.dataset.sure='1';rm.textContent='Click again to remove';return;}
    const em=rm.dataset.remove;rm.disabled=true;
    await sb.from('allowed_emails').delete().eq('email',em);await sb.from('profiles').update({active:false}).eq('email',em);await loadPeople();return;}
  const rs=e.target.closest('[data-resend]');
  if(rs){rs.disabled=true;const er=await sendLink(rs.dataset.resend);rs.textContent=er?'Could not send':'Link sent';return;}
  const ri=e.target.closest('[data-reinvite]');
  if(ri){ri.disabled=true;await sb.from('allowed_emails').upsert({email:ri.dataset.reinvite,full_name:ri.dataset.name});await sb.from('profiles').update({active:true}).eq('email',ri.dataset.reinvite);await loadPeople();}
});
/* ---------- to do / ta-da ---------- */
state.todos=[];
const ICON_CK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_X='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
async function loadTodos(){
  if(!sb||!state.uid) return;
  const since=addDays(new Date(),-60).toISOString();
  const{data,error}=await sb.from('todos').select('*').or('done.eq.false,done_at.gte.'+since).order('created_at');
  if(error){state.todoError=true;}else{state.todoError=false;state.todos=data||[];}
  if(state.tab==='todo') renderTodo();
}
function dueLabel(d){if(!d) return '';const t=iso(new Date());const cls=d<t?'late':d===t?'today':'';
  const lab=d===t?'Due today':d<t?'Overdue, '+dayLabel(d).replace('Yesterday','yesterday'):'Due '+dayLabel(d);return `<span class="due ${cls}">${esc(lab)}</span>`;}
function renderTodo(){
  if(state.todoError){$('#todo-list').innerHTML='<p class="hint">The To Do list needs a one-time database update. Run supabase/todos.sql in the Supabase SQL editor, then refresh.</p>';$('#tada-list').innerHTML='';return;}
  const open=state.todos.filter(t=>!t.done).sort((a,b)=>(a.due_date||'9999')<(b.due_date||'9999')?-1:(a.due_date||'9999')>(b.due_date||'9999')?1:a.created_at<b.created_at?-1:1);
  const done=state.todos.filter(t=>t.done).sort((a,b)=>a.done_at<b.done_at?1:-1);
  $('#td-count').textContent=open.length||'';$('#tada-count').textContent=done.length||'';
  $('#todo-list').innerHTML=open.length?open.map(t=>`<div class="td-item"><button class="tick" type="button" data-tddone="${esc(t.id)}" aria-label="Mark as done">${ICON_CK}</button>
    <div class="td-txt"><b>${esc(t.title)}</b>${dueLabel(t.due_date)}</div>
    <span class="td-acts"><button type="button" data-tdtime="${esc(t.id)}" title="Start the timer for this" aria-label="Start the timer for this">${ICON_PLAY}</button><button type="button" data-tddel="${esc(t.id)}" title="Delete" aria-label="Delete">${ICON_X}</button></span></div>`).join(''):'<p class="hint" style="padding:6px 0">Nothing on your list. Add something above.</p>';
  let last='';$('#tada-list').innerHTML=done.length?done.map(t=>{const d=iso(new Date(t.done_at));const head=d!==last?`<div class="tada-day">${esc(dayLabel(d))}</div>`:'';last=d;
    return head+`<button type="button" class="tada-item" data-tdundo="${esc(t.id)}" title="Move back to To Do"><span class="ck">${ICON_CK}</span><span class="t">${esc(t.title)}</span></button>`;}).join(''):'<p class="hint" style="padding:6px 0">Tick something off and it lands here.</p>';
}
let toastT=null;
function toast(html){const el=$('#toast');el.innerHTML=html;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{el.hidden=true;},3500);}
async function todoWrite(fn,rollback){try{const{error}=await fn();if(error) throw error;}catch(e){rollback();renderTodo();showBanner('That change did not save. Try again.');}}
$('#todo-form').addEventListener('submit',async ev=>{
  ev.preventDefault();if(!guard()) return;const title=$('#td-title').value.trim();if(!title) return;const due=$('#td-due').value||null;
  const t={id:newId(),user_id:state.uid,title,due_date:due,done:false,done_at:null,created_at:new Date().toISOString()};
  state.todos.push(t);$('#todo-form').reset();renderTodo();$('#td-title').focus();
  await todoWrite(()=>sb.from('todos').insert({id:t.id,user_id:t.user_id,title,due_date:due}),()=>{state.todos=state.todos.filter(x=>x.id!==t.id);});
});
document.addEventListener('click',async e=>{
  const dn=e.target.closest('[data-tddone]');
  if(dn){const t=state.todos.find(x=>x.id===dn.dataset.tddone);if(!t) return;const now=new Date().toISOString();t.done=true;t.done_at=now;renderTodo();
    const p=$('#tada-panel');p.classList.remove('pop');void p.offsetWidth;p.classList.add('pop');
    toast(`<em>Ta-da!</em> Moved to your done list <button type="button" data-tdundo="${esc(t.id)}">Undo</button>`);
    await todoWrite(()=>sb.from('todos').update({done:true,done_at:now}).eq('id',t.id),()=>{t.done=false;t.done_at=null;});return;}
  const un=e.target.closest('[data-tdundo]');
  if(un){$('#toast').hidden=true;const t=state.todos.find(x=>x.id===un.dataset.tdundo);if(!t) return;const prev=t.done_at;t.done=false;t.done_at=null;renderTodo();
    await todoWrite(()=>sb.from('todos').update({done:false,done_at:null}).eq('id',t.id),()=>{t.done=true;t.done_at=prev;});return;}
  const dl=e.target.closest('[data-tddel]');
  if(dl){if(dl.dataset.sure!=='1'){dl.dataset.sure='1';dl.style.color='var(--stop)';dl.title='Click again to delete';return;}
    const t=state.todos.find(x=>x.id===dl.dataset.tddel);state.todos=state.todos.filter(x=>x!==t);renderTodo();
    await todoWrite(()=>sb.from('todos').delete().eq('id',t.id),()=>{state.todos.push(t);});return;}
  const tm=e.target.closest('[data-tdtime]');
  if(tm){const t=state.todos.find(x=>x.id===tm.dataset.tdtime);if(!t||!guard()) return;
    state.manual=false;store.set('tt.manual','0');$('#t-task').value=t.title;$('#t-notes').value='';syncManual();
    try{await startTimer(t.title,$('#t-project').value.trim(),$('#t-loc').value,'');window.scrollTo({top:0,behavior:'smooth'});}catch(err){showBanner('The timer did not start. Try again.');}}
});
document.addEventListener('change',async e=>{
  const sel=e.target.closest('select[data-role]');if(!sel) return;
  const em=sel.dataset.role,role=sel.value,patch={is_admin:role==='admin',can_view_all:role!=='member'};sel.disabled=true;
  const a=await sb.from('allowed_emails').update(patch).eq('email',em);
  const b=await sb.from('profiles').update(patch).eq('email',em);
  if(a.error||b.error) showBanner(/can_view_all/.test((a.error||b.error).message)?'The Viewer role needs a one-time database update: run supabase/roles.sql in Supabase.':'That role change did not save. Try again.');
  await loadPeople();
});
function renderReports(list,r){
  const work=list.filter(e=>!isLeave(e.location));
  const tot=work.reduce((a,e)=>a+(+e.hours||0),0);
  const sum=l=>work.filter(e=>e.location===l).reduce((a,e)=>a+(+e.hours||0),0);
  const days=[];for(let d=new Date(r[0]);d<=r[1];d=addDays(d,1)){if(state.rperiod==='week'||d.getDay()<5||state.wkDays===7) days.push(iso(d));}
  const leaveDays={};list.filter(e=>isLeave(e.location)).forEach(e=>{(leaveDays[e.location]=leaveDays[e.location]||new Set()).add(e.uid+e.date)});
  const perDay=days.map(ds=>{const o={ds};['Office','Home','Field work'].forEach(l=>o[l]=work.filter(e=>e.date===ds&&e.location===l).reduce((a,e)=>a+(+e.hours||0),0));o.t=o.Office+o.Home+o['Field work'];return o;});
  const mx=Math.max(8,...perDay.map(o=>o.t));
  const bars=perDay.map(o=>`<div class="bar"><span class="val">${o.t?dur(o.t):''}</span><div class="stack" style="height:${(o.t/mx*100).toFixed(1)}%">${['Office','Home','Field work'].map(l=>o[l]?`<i style="height:${(o[l]/o.t*100).toFixed(1)}%;background:${LOCVAR[l]}"></i>`:'').join('')}</div></div>`).join('');
  const lbls=perDay.map(o=>{const d=parse(o.ds);return `<span>${state.rperiod==='week'?DN[d.getDay()]:d.getDate()}</span>`}).join('');
  const agg=k=>{const m={};work.forEach(e=>{const x=k(e);m[x]=(m[x]||0)+(+e.hours||0)});return Object.entries(m).sort((a,b)=>b[1]-a[1]);};
  const tbl=rows=>{const m=Math.max(1,...rows.map(x=>x[1]));return rows.length?`<table>${rows.map(([k,v])=>`<tr><td>${esc(k)}<div class="meter"><i style="width:${(v/m*100).toFixed(0)}%"></i></div></td><td class="r">${dur(v)}</td></tr>`).join('')}</table>`:'<p class="empty" style="padding:8px 0">No hours in this period.</p>';};
  const leaveRows=LEAVE.filter(l=>leaveDays[l]).map(l=>`<tr><td>${esc(l)}</td><td class="r">${leaveDays[l].size}d</td></tr>`).join('');
  $('#v-reports').innerHTML=`
    <div class="cards">
      <div class="card"><div class="k">Total worked</div><div class="v">${dur(tot)}</div></div>
      <div class="card"><div class="k">Office</div><div class="v">${dur(sum('Office'))}</div></div>
      <div class="card"><div class="k">Home</div><div class="v">${dur(sum('Home'))}</div></div>
      <div class="card"><div class="k">Field work</div><div class="v">${dur(sum('Field work'))}</div></div>
    </div>
    <div class="panel"><h3>Hours per day</h3><div class="bars" style="overflow-x:auto">${bars}</div><div class="barlbls">${lbls}</div>
      <div class="legend"><span><i style="background:var(--office)"></i>Office</span><span><i style="background:var(--home)"></i>Home</span><span><i style="background:var(--field)"></i>Field work</span></div></div>
    <div class="split">
      <div class="panel"><h3>By project</h3>${tbl(agg(e=>e.project||'No project'))}</div>
      <div class="panel"><h3>By person</h3>${tbl(agg(e=>nameOf(e.uid)))}</div>
      <div class="panel"><h3>Leave and holidays</h3>${leaveRows?`<table>${leaveRows}</table>`:'<p class="empty" style="padding:8px 0">No leave in this period.</p>'}</div>
    </div>`;
}

/* ---------- editor ---------- */
function openEditor(id,date){
  const e=findMine(id);if(!e) return;state.editing={id};
  $('#e-task').value=e.task||'';$('#e-notes').value=e.notes||'';$('#e-project').value=e.project||'';$('#e-loc').value=normLoc(e.location);
  $('#e-date').value=e.date;$('#e-hours').value=e.hours||'';$('#e-start').value=e.start||'';$('#e-end').value=e.end||'';
  $('#e-delq').hidden=true;$('#e-del').hidden=false;syncEditor();$('#editor').hidden=false;$('#e-task').focus();
}
function syncEditor(){const lv=isLeave($('#e-loc').value);['#e-start','#e-end','#e-hours'].forEach(s=>$(s).disabled=lv);}
const closeEditor=()=>{$('#editor').hidden=true;state.editing=null;};
$('#e-loc').addEventListener('change',syncEditor);
['#e-start','#e-end'].forEach(s=>$(s).addEventListener('change',()=>{const h=spanH($('#e-start').value,$('#e-end').value);if(h) $('#e-hours').value=h;}));
$('#e-cancel').onclick=closeEditor;
$('#editor').addEventListener('click',e=>{if(e.target.id==='editor') closeEditor();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#editor').hidden) closeEditor();});
$('#e-del').onclick=()=>{$('#e-delq').hidden=false;$('#e-del').hidden=true;};
$('#e-no').onclick=()=>{$('#e-delq').hidden=true;$('#e-del').hidden=false;};
$('#e-yes').onclick=async()=>{const{id}=state.editing;closeEditor();try{await deleteEntry(id);}catch(e){showBanner('That entry was not deleted. Try again.');}};
$('#e-form').addEventListener('submit',async ev=>{
  ev.preventDefault();const{id}=state.editing;const lv=isLeave($('#e-loc').value);
  const ch={task:$('#e-task').value.trim(),notes:$('#e-notes').value.trim(),project:$('#e-project').value.trim(),location:$('#e-loc').value,date:$('#e-date').value,
    start:lv?'':$('#e-start').value,end:lv?'':$('#e-end').value,hours:lv?0:(parseFloat($('#e-hours').value)||spanH($('#e-start').value,$('#e-end').value)||0)};
  if(!ch.task||!ch.date) return;if(!lv&&!(ch.hours>0)){$('#e-hours').focus();return;}
  closeEditor();
  try{await updateEntry(id,ch);}catch(e){showBanner('Your changes did not save. Try again.');}
});

/* ---------- clicks ---------- */
document.addEventListener('click',async e=>{
  const ed=e.target.closest('[data-edit]');if(ed){openEditor(ed.dataset.edit,ed.dataset.date);return;}
  const pl=e.target.closest('[data-play]');if(pl){if(!guard()) return;const x=findMine(pl.dataset.play);if(!x) return;
    state.manual=false;store.set('tt.manual','0');$('#t-task').value=x.task;$('#t-project').value=x.project||'';$('#t-loc').value=normLoc(x.location);$('#t-notes').value='';syncManual();
    try{await startTimer(x.task,x.project||'',normLoc(x.location),'');}catch(err){showBanner('The timer did not start. Try again.');}return;}
  const mc=e.target.closest('.mc[data-mday]');
  if(mc&&!e.target.closest('.mt')&&!mc.classList.contains('leave')){if(!guard()) return;
    state.manual=true;store.set('tt.manual','1');$('#t-date').value=mc.dataset.mday;$('#t-start').value='';$('#t-end').value='';syncManual();$('#t-task').focus();window.scrollTo({top:0,behavior:'smooth'});return;}
  const col=e.target.closest('.col[data-day]');if(col&&!col.classList.contains('leave')&&e.target===col){
    const rect=col.getBoundingClientRect();const lo=+(col.parentElement.querySelector('.gutter span')||{textContent:'09'}).textContent.slice(0,2);
    const hr=Math.floor(lo+(e.clientY-rect.top)/(state.tab==='dayview'?56:40));state.manual=true;store.set('tt.manual','1');
    $('#t-date').value=col.dataset.day;$('#t-start').value=pad(hr%24)+':00';$('#t-end').value=pad((hr+1)%24)+':00';syncManual();$('#t-task').focus();window.scrollTo({top:0,behavior:'smooth'});}
});
document.querySelectorAll('#tview button').forEach(b=>b.onclick=()=>{state.tview=b.dataset.tv;store.set('tt.tview',state.tview);render();});
document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;store.set('tt.tab',state.tab);render();});
function shift(n){const a=state.anchor;if(isDayMode()){state.anchor=addDays(a,n);render();return;}state.anchor=(state.tab==='month'||(state.tab==='reports'&&state.rperiod==='month'))?new Date(a.getFullYear(),a.getMonth()+n,1):addDays(a,7*n);render();}
$('#prev').onclick=()=>shift(-1);$('#next').onclick=()=>shift(1);$('#today').onclick=()=>{state.anchor=new Date();render();};
$('#rperiod').onchange=e=>{state.rperiod=e.target.value;render();};
$('#person').onchange=e=>{state.person=e.target.value;store.set('tt.person',state.person);render();};
$('#wkdays').value=String(state.wkDays);$('#wkdays').onchange=e=>{state.wkDays=Number(e.target.value);store.set('tt.wkdays',String(state.wkDays));render();};
$('#usual').onclick=async()=>{
  if(!guard()) return;const date=(isDayMode())?iso(state.anchor):(state.manual&&$('#t-date').value?$('#t-date').value:iso(new Date()));
  const mine=allEntries().filter(x=>x.uid===state.uid&&x.date===date);
  if(mine.some(x=>isLeave(normLoc(x.location)))){showBanner('That day is marked as leave or a holiday. Remove that entry first if you worked.');return;}
  const add=[];const now=Date.now();
  if(!mine.some(x=>normLoc(x.location)==='Office'&&x.start==='11:00')) add.push({id:newId(),date,task:'Office hours',project:'',notes:'',hours:7,location:'Office',start:'11:00',end:'18:00',created:now});
  if(!mine.some(x=>normLoc(x.location)==='Home'&&x.start==='23:00')) add.push({id:newId(),date,task:'Home hours',project:'',notes:'',hours:1,location:'Home',start:'23:00',end:'00:00',created:now+1});
  if(!add.length){showBanner('Your usual day is already logged for '+dayLabel(date).toLowerCase()+'.');return;}
  try{await addEntries(add);$('#banner').hidden=true;state.anchor=parse(date);render();}catch(e){showBanner('That did not save. Try again.');}
};
$('#export').onclick=async()=>{
  const r=range();const l=inRange(visible(),r).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.start||'')<(b.start||'')?-1:1);
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=['Date,Person,Where,From,To,Project,Task,Notes,Hours',...l.map(e=>[e.date,nameOf(e.uid)==='You'?'Me':nameOf(e.uid),e.location,e.start,e.end,e.project,e.task,e.notes,e.hours].map(q).join(','))].join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='timesheet_'+iso(r[0])+'_to_'+iso(r[1])+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
};

function greet(){const n=new Date(),h=n.getHours();const g=h<5?'Working late':h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  $('#greet').innerHTML=g+', <em>'+esc(state.vname||'Amira')+'</em>';
  $('#today-line').textContent=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][n.getDay()]+', '+n.getDate()+' '+['January','February','March','April','May','June','July','August','September','October','November','December'][n.getMonth()]+' '+n.getFullYear();}
greet();setInterval(greet,60000);
/* ---------- sign in ---------- */
function showLogin(msg){$('#app').hidden=true;$('#login').hidden=false;if(msg) $('#login-msg').textContent=msg;}
$('#login-form').addEventListener('submit',async ev=>{
  ev.preventDefault();if(!sb) return;const email=$('#l-email').value.trim().toLowerCase();if(!email) return;
  $('#l-go').disabled=true;$('#login-msg').textContent='Sending...';
  const{error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname}});
  $('#l-go').disabled=false;
  $('#login-msg').textContent=error?(/invite|database error/i.test(error.message)?'This email has not been invited yet. Ask Amira to invite you.':'Could not send the link: '+error.message):'Check your inbox for a sign-in link from Supabase. You can close this tab.';
});
$('#signout').onclick=async()=>{await sb.auth.signOut();location.reload();};

let booted=false;
async function boot(session){
  if(booted) return;booted=true;
  state.uid=session.user.id;
  const{data:me}=await sb.from('profiles').select('*').eq('id',state.uid).maybeSingle();
  if(!me||!me.active){booted=false;await sb.auth.signOut();showLogin('Your access to this timesheet is not active. Ask Amira to invite you again.');return;}
  state.isAdmin=!!me.is_admin;state.canViewAll=!!(me.is_admin||me.can_view_all);state.vname=(me.full_name||me.email).trim().split(/\s+/)[0];
  $('#who-line').textContent=me.full_name||me.email;$('#nav-team').hidden=!state.isAdmin;
  $('#login').hidden=true;$('#app').hidden=false;greet();
  const t=await sb.from('timers').select('*').eq('user_id',state.uid).maybeSingle();state.timer=timerFromRow(t.data);
  syncManual();render();loadPeople();loadTodos();
  sb.channel('live').on('postgres_changes',{event:'*',schema:'public',table:'entries'},p=>{
    if(p.eventType==='DELETE'){state.rows.delete(p.old.id);}
    else{const e=fromRow(p.new);if(state.loaded.has(e.date.slice(0,7))) state.rows.set(e.id,e);}
    render();
  }).on('postgres_changes',{event:'*',schema:'public',table:'timers',filter:'user_id=eq.'+state.uid},p=>{state.timer=p.eventType==='DELETE'?null:timerFromRow(p.new);paintTimer();}).on('postgres_changes',{event:'*',schema:'public',table:'todos',filter:'user_id=eq.'+state.uid},()=>loadTodos()).subscribe();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') refreshLoaded();});
}
greet();setInterval(greet,60000);syncManual();
(async()=>{
  if(!sb){showLogin('This tracker is not connected to its database yet. Add your Supabase details to config.js.');$('#l-go').disabled=true;return;}
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.get('error_description')){showLogin(h.get('error_description').replace(/\+/g,' ')+'. Request a new link below.');history.replaceState(null,'',location.pathname);}
  sb.auth.onAuthStateChange((ev,session)=>{if(session) boot(session);});
  const{data}=await sb.auth.getSession();
  if(data.session) boot(data.session);else if($('#login').hidden) showLogin();
})();
})();

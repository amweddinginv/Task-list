import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY, FILES_BUCKET } from './config.js';

const ICON = {
  check:'<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-5"/></svg>',
  starOff:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M10 2.5l2.3 4.7 5.2.8-3.8 3.7.9 5.1L10 14.4l-4.6 2.4.9-5.1L2.5 8l5.2-.8z"/></svg>',
  starOn:'<svg viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M10 2.5l2.3 4.7 5.2.8-3.8 3.7.9 5.1L10 14.4l-4.6 2.4.9-5.1L2.5 8l5.2-.8z"/></svg>',
  note:'<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2.5 1.5h5l2 2v7h-7z"/><path d="M4 6h4M4 8h3"/></svg>',
  link:'<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M5 7l2-2"/><path d="M6.5 3.5l1-1a2 2 0 012.8 2.8l-1 1M5.5 8.5l-1 1a2 2 0 01-2.8-2.8l1-1"/></svg>',
  clip:'<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M9.5 5.5L5.8 9.2a2.3 2.3 0 01-3.3-3.3L6.4 2a1.5 1.5 0 012.2 2.2L4.8 8a.8.8 0 01-1.1-1.1L7 3.6"/></svg>',
  cal:'<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.5" y="2.5" width="9" height="8" rx="1"/><path d="M1.5 5h9M4 1.5v2M8 1.5v2"/></svg>',
  repeat:'<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5V5a2 2 0 012-2h6M8.5 1.5L10 3 8.5 4.5M10 6.5V7a2 2 0 01-2 2H2M3.5 10.5L2 9l1.5-1.5"/></svg>',
  x:'<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>',
  save:'<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1.5v6M3.5 5L6 7.5 8.5 5M2 10h8"/></svg>',
  trash:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/></svg>',
  close:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  back:'<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 2L4 7l5 5"/></svg>',
  bell:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V7a4 4 0 018 0v4l1 1.5H3z"/><path d="M6.5 14a1.6 1.6 0 003 0"/></svg>',
  bellOn:'<svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V7a4 4 0 018 0v4l1 1.5H3z"/><path d="M6.5 14a1.6 1.6 0 003 0" fill="none"/></svg>'
};
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
let user = null;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr = v => Array.isArray(v) ? v : [];

$('#today').textContent = new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});

// The artifact talked to window.claude storage; here the same calls go to Supabase.
const fromRow = r => ({
  id: r.id, title: r.title, important: !!r.important, priority: r.priority || 'normal', done: !!r.done,
  completedAt: r.completed_at ?? null, created: r.created, order: r.order, due: r.due ?? null, repeat: r.repeat ?? null,
  reminderAt: r.reminder_at ?? null, remindedAt: r.reminded_at ?? null,
  notes: r.notes || '', steps: arr(r.steps), links: arr(r.links), files: arr(r.files)
});
const KEYMAP = { completedAt:'completed_at', reminderAt:'reminder_at', remindedAt:'reminded_at' };
const toRow = f => { const o = {}; for(const [k,v] of Object.entries(f)){ if(k==='id') continue; o[KEYMAP[k]||k] = v; } return o; };
const must = ({error}) => { if(error) throw error; };
const col = {
  doc: id => ({
    update: fields => sb.from('tasks').update(toRow(fields)).eq('id', id).then(must),
    set: data => sb.from('tasks').upsert({ id, ...toRow(data) }).then(must),
    delete: () => sb.from('tasks').delete().eq('id', id).then(must)
  })
};
const assets = {
  async upload(file, {type, taskId}){
    if(file.size > 20 * 1024 * 1024){ const e = new Error(); e.code = 'too_large'; throw e; }
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
    const path = `${user.id}/${taskId}/${Date.now().toString(36)}-${safe}`;
    const { error } = await sb.storage.from(FILES_BUCKET).upload(path, file, { contentType: type, upsert: false });
    if(error){ const e = new Error(error.message); e.code = /exceed|too large|size/i.test(error.message) ? 'too_large' : 'upload'; throw e; }
    return { id: path, contentType: type, sizeBytes: file.size };
  },
  delete: path => sb.storage.from(FILES_BUCKET).remove([path])
};
const downloads = {
  async save({filename, data}){
    const file = new File([data], filename, { type: data.type });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      try { await navigator.share({ files: [file] }); return; }
      catch(err){ if(err && err.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
};
const assetsChecked = true;
// Signed links for private files, cached for about an hour.
const urlCache = new Map();
const blobUrl = path => { const c = urlCache.get(path); return c && c.exp > Date.now() ? c.url : ''; };
let urlBusy = false;
async function ensureUrls(paths){
  const need = paths.filter(p => !blobUrl(p));
  if(!need.length || urlBusy) return;
  urlBusy = true;
  try {
    const { data } = await sb.storage.from(FILES_BUCKET).createSignedUrls(need, 3600);
    (data || []).forEach(d => { if(d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: Date.now() + 3300000 }); });
  } finally { urlBusy = false; }
  renderPanel();
}
async function signedUrl(path){
  if(blobUrl(path)) return blobUrl(path);
  const { data, error } = await sb.storage.from(FILES_BUCKET).createSignedUrl(path, 3600);
  if(error) throw error;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3300000 });
  return data.signedUrl;
}
let tasks = new Map();
let selected = null;
let showDone = false;
let canWrite = true;
let query = '';
let uploading = 0;
let drag = null, suppressUntil = 0, openSwipe = null;
const SWIPE = 88;
try { showDone = localStorage.getItem('showDone') === '1'; } catch(e){}

// ---------- dates ----------
const pad = n => String(n).padStart(2,'0');
const ymd = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parseYmd = s => { const [y,m,d] = String(s).split('-').map(Number); return new Date(y, m-1, d); };
const today0 = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
function dayDiff(s){ return Math.round((parseYmd(s) - today0()) / 86400000); }
function dueText(s){
  const n = dayDiff(s);
  if(n === 0) return 'Today';
  if(n === 1) return 'Tomorrow';
  if(n === -1) return 'Yesterday';
  const d = parseYmd(s);
  const opts = {weekday:'short', month:'short', day:'numeric'};
  if(d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}
function dueClass(s){ const n = dayDiff(s); return n < 0 ? 'due-over' : (n === 0 ? 'due-today' : ''); }
const REPEATS = [['', 'Never'], ['daily','Daily'], ['weekdays','Weekdays'], ['weekly','Weekly'], ['monthly','Monthly'], ['yearly','Yearly']];
const repeatName = r => (REPEATS.find(x=>x[0]===r)||['',''])[1];
function addMonths(d, n){
  const day = d.getDate(); const x = new Date(d.getFullYear(), d.getMonth()+n, 1);
  const last = new Date(x.getFullYear(), x.getMonth()+1, 0).getDate();
  x.setDate(Math.min(day, last)); return x;
}
function nextDue(due, repeat){
  let d = due ? parseYmd(due) : today0();
  switch(repeat){
    case 'daily': d = addDays(d,1); break;
    case 'weekdays': do { d = addDays(d,1); } while(d.getDay()===0 || d.getDay()===6); break;
    case 'weekly': d = addDays(d,7); break;
    case 'monthly': d = addMonths(d,1); break;
    case 'yearly': d = addMonths(d,12); break;
  }
  return ymd(d);
}

// ---------- writes: one at a time per task ----------
const queues = new Map();
let savingTimer;
function flash(msg){
  const el = $('#saving'); el.textContent = msg; el.classList.add('show');
  clearTimeout(savingTimer); savingTimer = setTimeout(()=>el.classList.remove('show'), 1600);
}
const inflight = new Map(); // id -> writes not yet confirmed; live updates for these wait
let inflightTotal = 0;
function write(id, fn){
  if(!user || !canWrite) return Promise.resolve();
  const prev = queues.get(id) || Promise.resolve();
  inflight.set(id, (inflight.get(id)||0) + 1); inflightTotal++;
  const next = prev.then(fn).then(()=>flash('Saved')).catch(err=>{
    console.error(err);
    if(err && /JWT|auth/i.test(err.message||'')){ flash('Please sign in again.'); return; }
    flash('Could not save. Check your connection.');
  }).finally(()=>{
    const n = (inflight.get(id)||1) - 1; inflightTotal--;
    if(n > 0) inflight.set(id, n); else inflight.delete(id);
    if(!inflightTotal && needRefetch){ needRefetch = false; refetch(); }
  });
  queues.set(id, next);
  return next;
}
function patch(id, fields){
  const t = tasks.get(id); if(!t) return;
  Object.assign(t, fields);
  render();
  return write(id, ()=>col.doc(id).update(fields));
}
function createTask(id, data){
  tasks.set(id, {id, ...data});
  render();
  return write(id, ()=>col.doc(id).set(data));
}
function newId(){ return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ---------- sorting & search ----------
function prio(t){ return t.important ? 'high' : (t.priority === 'low' ? 'low' : 'normal'); }
function ord(t){ return typeof t.order === 'number' ? t.order : (t.created||0); }
function edgeOrder(dir, exceptId){
  const v = [...tasks.values()].filter(x=>x.id!==exceptId && typeof x.order==='number').map(x=>x.order);
  if(!v.length) return 1000;
  return dir < 0 ? Math.min(...v) - 1000 : Math.max(...v) + 1000;
}
function matches(t){
  if(!query) return true;
  const q = query.toLowerCase();
  const hay = [t.title, t.notes, ...arr(t.steps).map(s=>s.title), ...arr(t.links).map(l=>l.label+' '+l.url), ...arr(t.files).map(f=>f.name)].join(' ').toLowerCase();
  return hay.includes(q);
}
function sorted(done){
  return [...tasks.values()].filter(t=>!!t.done===done && matches(t)).sort((a,b)=>{
    if(done) return (b.completedAt||0)-(a.completedAt||0);
    return ord(a)-ord(b);
  });
}

// ---------- reminders ----------
function remindText(iso){
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
  return dueText(ymd(d)) + ', ' + time;
}
// The due time is stored as reminder_at: the notification fires at the due date + time.
const dueTime = t => { if(!t.reminderAt) return ''; const d = new Date(t.reminderAt); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const withTime = (dateStr, hhmm) => { const [h,m] = hhmm.split(':').map(Number); const d = parseYmd(dateStr); d.setHours(h, m, 0, 0); return d.toISOString(); };
const timeText = iso => new Date(iso).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
function dueLabel(t){ return dueText(t.due) + (t.reminderAt ? ', ' + timeText(t.reminderAt) : ''); }
function isOver(t){ const n = dayDiff(t.due); return n < 0 || (n === 0 && t.reminderAt && new Date(t.reminderAt) < new Date()); }
function dueCls(t){ return isOver(t) ? 'due-over' : (dayDiff(t.due) === 0 ? 'due-today' : ''); }
function dueFields(t, dateStr){
  const f = {due: dateStr};
  if(!dateStr){ f.repeat = null; f.reminderAt = null; f.remindedAt = null; }
  else if(t.reminderAt){ f.reminderAt = withTime(dateStr, dueTime(t)); f.remindedAt = null; }
  return f;
}
const toLocalInput = iso => { if(!iso) return ''; const d = new Date(iso); return ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fromLocalInput = v => v ? new Date(v).toISOString() : null;

// ---------- list ----------
function rowHTML(t){
  const p = prio(t);
  const steps = arr(t.steps), links = arr(t.links), files = arr(t.files);
  const meta = [];
  if(t.due && !t.done) meta.push(`<span class="${dueCls(t)}">${t.reminderAt ? ICON.bell : ICON.cal}${isOver(t)?'Overdue, ':''}${esc(dueLabel(t))}</span>`);
  else if(t.reminderAt && !t.done) meta.push(`<span class="bell" title="Reminder">${ICON.bell}${esc(remindText(t.reminderAt))}</span>`);
  if(t.repeat) meta.push(`<span title="Repeats ${esc(repeatName(t.repeat).toLowerCase())}">${ICON.repeat}</span>`);
  if(steps.length) meta.push(`<span>${steps.filter(s=>s.done).length} of ${steps.length}</span>`);
  if(p==='low' && !t.done) meta.push(`<span class="chip low">Low priority</span>`);
  if(t.notes && String(t.notes).trim()) meta.push(`<span title="Has notes">${ICON.note}Note</span>`);
  if(links.length) meta.push(`<span title="Links">${ICON.link}${links.length}</span>`);
  if(files.length) meta.push(`<span title="Files">${ICON.clip}${files.length}</span>`);
  return `<div class="swipe ${openSwipe===t.id?'open':''}" data-id="${esc(t.id)}">
  <button class="swipe-del" data-act="swipe-del" tabindex="-1" aria-label="Delete task">${ICON.trash}Delete</button>
  <div class="task ${t.done?'done':''} ${t.done?'':p} ${selected===t.id?'selected':''}" data-id="${esc(t.id)}" role="button" tabindex="0">
    <button class="check ${t.done?'on':''}" data-act="toggle" aria-label="${t.done?'Mark as not completed':'Mark as completed'}">${ICON.check}</button>
    <div class="body"><div class="title">${esc(t.title||'Untitled task')}</div><div class="meta">${meta.join('')}</div></div>
    <button class="star ${t.important?'on':''}" data-act="star" aria-label="${t.important?'Remove importance':'Mark as important'}" aria-pressed="${!!t.important}">${t.important?ICON.starOn:ICON.starOff}</button>
  </div></div>`;
}
function renderList(){
  if(drag && drag.active) return;
  const open = sorted(false), done = sorted(true);
  const list = $('#list');
  if(query && !open.length && !done.length){
    list.innerHTML = `<div class="state"><strong>No matches</strong>Nothing found for "${esc(query)}".</div>`;
  } else if(!tasks.size){
    list.innerHTML = `<div class="state"><strong>No tasks yet</strong>Type in "Add a task" above, or ask Claude in chat to add some.</div>`;
  } else if(!open.length){
    list.innerHTML = query ? '' : `<div class="state"><strong>All done</strong>Everything is ticked off.</div>`;
  } else list.innerHTML = open.map(rowHTML).join('');
  const showD = showDone || !!query;
  const tg = $('#doneToggle');
  tg.hidden = !done.length;
  tg.classList.toggle('open', showD);
  tg.setAttribute('aria-expanded', String(showD));
  $('#doneCount').textContent = done.length;
  const dl = $('#doneList');
  dl.hidden = !showD || !done.length;
  dl.innerHTML = done.map(rowHTML).join('');
}

// ---------- panel ----------
function editing(){
  const a = document.activeElement;
  return a && $('#panel').contains(a) && (a.tagName==='TEXTAREA' || (a.tagName==='INPUT' && a.type!=='file'));
}
const IMG = /^image\//, VID = /^video\//;
function fmtSize(b){ if(!b && b!==0) return ''; if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(0)+' KB'; return (b/1048576).toFixed(1)+' MB'; }
function extOf(name){ const m = /\.([a-z0-9]{1,5})$/i.exec(name||''); return m ? m[1].toUpperCase() : 'FILE'; }
function renderPanel(force){
  const panel = $('#panel');
  const t = selected && tasks.get(selected);
  if(!t){ panel.hidden = true; return; }
  panel.hidden = false;
  if(!force && editing()) return;
  const steps = arr(t.steps), links = arr(t.links), files = arr(t.files);
  const p = prio(t);
  const tday = ymd(today0()), tmrw = ymd(addDays(today0(),1));
  const created = t.created ? new Date(t.created).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : '';
  const dn = t.due ? dayDiff(t.due) : null;
  panel.innerHTML = `
    <button class="back" data-act="close">${ICON.back}Tasks</button>
    <div class="p-scroll">
      <div class="card">
        <div class="p-head">
          <button class="check ${t.done?'on':''}" data-act="toggle-sel" aria-label="${t.done?'Mark as not completed':'Mark as completed'}">${ICON.check}</button>
          <textarea class="p-title" id="pTitle" rows="1" aria-label="Task title" maxlength="300">${esc(t.title)}</textarea>
          <button class="star ${t.important?'on':''}" data-act="star-sel" aria-label="${t.important?'Remove importance':'Mark as important'}">${t.important?ICON.starOn:ICON.starOff}</button>
        </div>
        <div class="steps">${steps.map((s,i)=>`
          <div class="step ${s.done?'done':''}">
            <button class="check ${s.done?'on':''}" data-act="step-toggle" data-i="${i}" aria-label="Toggle step">${ICON.check}</button>
            <input id="step-${esc(s.id||i)}" data-step="${i}" value="${esc(s.title)}" aria-label="Step" maxlength="300">
            <button class="x" data-act="step-del" data-i="${i}" aria-label="Delete step">${ICON.x}</button>
          </div>`).join('')}
        </div>
        <form class="add-step" id="stepForm"><span aria-hidden="true">+</span><input id="stepInput" placeholder="${steps.length?'Next step':'Add step'}" aria-label="Add step" maxlength="300"></form>
      </div>

      <div class="card">
        <div class="row-label">${ICON.cal}DUE DATE</div>
        <div class="seg">
          <button data-act="due" data-v="today" class="${t.due===tday?'on':''}">Today</button>
          <button data-act="due" data-v="tomorrow" class="${t.due===tmrw?'on':''}">Tomorrow</button>
          <button data-act="due" data-v="nextweek">Next week</button>
        </div>
        <label class="date-field">${ICON.cal}<input type="date" id="dueInput" value="${esc(t.due||'')}" aria-label="Pick a due date"></label>
        <label class="date-field">${ICON.bell}<input type="time" id="timeInput" value="${esc(dueTime(t))}" aria-label="Due time (you get a notification then)">${t.reminderAt ? `<button class="x" type="button" data-act="time-clear" aria-label="Remove due time">${ICON.x}</button>` : '<span class="hint">Add time</span>'}</label>
        ${t.due ? `<div class="due-now ${isOver(t)?'over':(dn===0?'today':'')}">${isOver(t)?'Overdue, due ':'Due '}${esc(dueLabel(t))}${t.reminderAt ? `<span class="notif">${t.remindedAt ? '· notified' : '· notification on'}</span>` : ''}<button class="x" data-act="due-clear" aria-label="Remove due date">${ICON.x}</button></div>` : ''}
        <div class="row-label">${ICON.repeat}REPEAT</div>
        <div class="seg">${REPEATS.map(([v,l])=>`<button data-act="repeat" data-v="${v}" class="${(t.repeat||'')===v?'on':''}">${l}</button>`).join('')}</div>
      </div>

      <div class="card">
        <div class="row-label">PRIORITY</div>
        <div class="seg">
          <button data-p="high" class="${p==='high'?'on':''}"><span class="dot" style="background:var(--high)"></span>Important</button>
          <button data-p="normal" class="${p==='normal'?'on':''}">Normal</button>
          <button data-p="low" class="${p==='low'?'on':''}"><span class="dot" style="background:var(--low)"></span>Low</button>
        </div>
      </div>

      <div class="card">
        <div class="row-label">${ICON.clip}FILES</div>
        <div class="files">${files.map((f,i)=>`
          <div class="file">
            <button class="thumb" data-act="file-open" data-i="${i}" aria-label="Open ${esc(f.name)}">${IMG.test(f.type||'') ? (blobUrl(f.id) ? `<img src="${esc(blobUrl(f.id))}" alt="" loading="lazy">` : '') : esc(extOf(f.name))}</button>
            <div class="fmeta" data-act="file-open" data-i="${i}"><div class="fname">${esc(f.name||'File')}</div><div class="fsize">${esc(fmtSize(f.size))}</div></div>
            <button class="x" data-act="file-save" data-i="${i}" aria-label="Save ${esc(f.name)}">${ICON.save}</button>
            <button class="x" data-act="file-del" data-i="${i}" aria-label="Remove ${esc(f.name)}">${ICON.x}</button>
          </div>`).join('')}
        </div>
        ${uploading ? `<p class="note" style="padding:4px 14px 0">Uploading ${uploading} file${uploading>1?'s':''}…</p>` : ''}
        ${assets ? `<label class="add-file"><span aria-hidden="true">+</span>Add a file<input class="vh" type="file" id="fileInput" multiple accept="image/*,video/mp4,video/webm,video/quicktime,application/pdf,.pdf,.txt,.csv,.md,.json"></label>`
          : `<p class="note" style="padding:0 14px 12px">${assetsChecked ? 'Only the list owner can add files.' : 'Checking file access…'}</p>`}
      </div>

      <div class="card">
        <div class="row-label">${ICON.link}LINKS</div>
        <div class="links">${links.map((l,i)=>`
          <div class="link">${ICON.link}<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label||l.url)}</a>
          <button class="x" data-act="link-del" data-i="${i}" aria-label="Remove link">${ICON.x}</button></div>`).join('')}
        </div>
        <form class="link-form" id="linkForm">
          <input id="linkUrl" placeholder="Paste a link" aria-label="Link address" inputmode="url">
          <div class="row"><input id="linkLabel" placeholder="Name (optional)" aria-label="Link name"><button class="btn" type="submit">Add</button></div>
        </form>
      </div>

      <div class="card">
        <textarea class="notes" id="pNotes" placeholder="Add note" aria-label="Notes">${esc(t.notes||'')}</textarea>
      </div>
    </div>
    <div class="p-foot">
      <button class="icon-btn" data-act="close" aria-label="Close details">${ICON.close}</button>
      <span>${created ? 'Created '+esc(created) : ''}${t.done && t.completedAt ? ' · Completed '+esc(new Date(t.completedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})) : ''}</span>
      <button class="icon-btn" data-act="del" aria-label="Delete task">${ICON.trash}</button>
    </div>`;
  autosize($('#pTitle'));
  ensureUrls(files.filter(f=>IMG.test(f.type||'')).map(f=>f.id));
}
function autosize(el){ if(!el) return; el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }
function render(force){ renderList(); renderPanel(force); }

// ---------- completion ----------
let actx = null;
function ding(){
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if(actx.state === 'suspended') actx.resume();
    const now = actx.currentTime;
    [[1318.5, 0], [1975.5, 0.09]].forEach(([f, t]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.18, now + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.6);
      o.connect(g).connect(actx.destination);
      o.start(now + t); o.stop(now + t + 0.65);
    });
  } catch(err){}
}
function complete(id){
  const t = tasks.get(id); if(!t || t.done) return;
  const rep = t.repeat;
  if(rep){
    const nid = newId();
    const next = nextDue(t.due, rep);
    // Keep the reminder at the same time of day, moved by the same number of days as the due date.
    let reminderAt = null;
    if(t.reminderAt){
      const shift = Math.round((parseYmd(next) - parseYmd(t.due || ymd(today0()))) / 86400000);
      const r = new Date(t.reminderAt); r.setDate(r.getDate() + shift);
      reminderAt = r.toISOString();
    }
    createTask(nid, {
      title: t.title, important: !!t.important, priority: t.priority || 'normal', done: false,
      notes: t.notes || '', steps: arr(t.steps).map(s=>({...s, done:false})), links: arr(t.links).map(l=>({...l})),
      files: arr(t.files).map(f=>({...f})), created: Date.now(), completedAt: null,
      order: ord(t), due: next, repeat: rep, reminderAt
    });
    if(selected === id) selected = nid;
    flash('Next one due ' + dueText(nextDue(t.due, rep)));
  }
  patch(id, {done:true, completedAt: Date.now(), repeat: null});
}
function toggleDone(id, btn){
  const t = tasks.get(id); if(!t) return;
  if(!t.done){
    ding();
    if(btn){
      btn.classList.add('pop');
      const row = btn.closest('.task'); if(row) row.classList.add('finishing');
      setTimeout(() => complete(id), 650);
    } else complete(id);
    return;
  }
  patch(id, {done:false, completedAt:null});
}
function setPriority(id, p){
  const cur = tasks.get(id); if(!cur) return;
  const f = {important: p==='high', priority: p==='low' ? 'low' : 'normal'};
  if(p==='high' && !cur.important) f.order = edgeOrder(-1, id);
  if(p==='low' && cur.priority!=='low') f.order = edgeOrder(1, id);
  patch(id, f);
  renderPanel(true);
}

// ---------- delete with undo ----------
let pendingDelete = null, toastTimer = null;
function showToast(msg, ms, action){
  const el = $('#toast');
  $('#toastMsg').textContent = msg;
  const bar = $('#toastBar');
  bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = `shrink ${ms}ms linear forwards`;
  $('#toastBtn').onclick = action;
  $('#toastBtn').hidden = !action;
  el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>{ el.hidden = true; }, ms);
}
function hideToast(){ clearTimeout(toastTimer); $('#toast').hidden = true; }
function deleteTask(id){
  const t = tasks.get(id); if(!t) return;
  finalizeDelete();
  const {id:_, ...data} = t;
  tasks.delete(id);
  if(selected === id) selected = null;
  openSwipe = null;
  render();
  write(id, ()=>col.doc(id).delete());
  pendingDelete = {id, data, timer: setTimeout(finalizeDelete, 6000)};
  showToast('Task deleted', 6000, undoDelete);
}
function undoDelete(){
  const p = pendingDelete; if(!p) return;
  clearTimeout(p.timer); pendingDelete = null; hideToast();
  createTask(p.id, p.data);
  flash('Restored');
}
function finalizeDelete(){
  const p = pendingDelete; if(!p) return;
  clearTimeout(p.timer); pendingDelete = null;
  purgeFiles(arr(p.data.files));
}
function purgeFiles(files){
  if(!assets) return;
  files.forEach(f => {
    const used = [...tasks.values()].some(t => arr(t.files).some(x => x.id === f.id));
    if(!used) assets.delete(f.id).catch(()=>{});
  });
}

// ---------- files ----------
const TEXT_TYPES = {txt:'text/plain', csv:'text/csv', md:'text/markdown', json:'application/json'};
const OK_TYPES = /^(image\/(png|jpeg|gif|webp|heic|heif|svg\+xml)|video\/(mp4|webm|quicktime)|application\/pdf|text\/(plain|csv|markdown)|application\/json)$/;
function typeFor(file){
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name)||[])[1]?.toLowerCase() || '';
  if(TEXT_TYPES[ext]) return TEXT_TYPES[ext];
  if(OK_TYPES.test(file.type)) return file.type;
  const map = {png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', pdf:'application/pdf', mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', heic:'image/heic', heif:'image/heif'};
  return map[ext] || '';
}
async function uploadFiles(id, list){
  if(!assets) return;
  const added = [];
  uploading += list.length; renderPanel(true);
  for(const file of list){
    const type = typeFor(file);
    try {
      if(!type){ const e = new Error(); e.code = 'unsupported_type'; throw e; }
      let res;
      try { res = await assets.upload(file, {type, taskId:id}); }
      catch(err){ if(err && err.code === 'store_unavailable'){ await new Promise(r=>setTimeout(r, 1200)); res = await assets.upload(file, {type, taskId:id}); } else throw err; }
      added.push({id: res.id, name: file.name, type: res.contentType || type, size: res.sizeBytes || file.size});
    } catch(err){
      const c = err && err.code;
      flash(c==='too_large' ? `${file.name} is over the size limit (20 MB)` :
            c==='unsupported_type' ? `${file.name}: photos, videos, PDFs and text files only` :
            c==='quota_or_state' ? 'File storage is full' :
            c==='rate_limited' ? 'Too many uploads at once. Try again in a moment.' :
            `Could not upload ${file.name}`);
    }
    uploading--;
  }
  const t = tasks.get(id);
  if(t && added.length) patch(id, {files: [...arr(t.files), ...added]});
  renderPanel(true);
}
async function openViewer(f){
  const v = $('#viewer');
  let src;
  try { src = await signedUrl(f.id); } catch(err){ flash('That file is no longer available'); return; }
  const media = IMG.test(f.type||'') ? `<img src="${esc(src)}" alt="${esc(f.name)}">`
    : VID.test(f.type||'') ? `<video src="${esc(src)}" controls playsinline></video>` : '';
  v.innerHTML = `<div class="viewer-bar"><span>${esc(f.name)}</span><div>${downloads?'<button data-v="save">Save</button>':''}<button data-v="close">Close</button></div></div><div class="viewer-body">${media}</div>`;
  v.hidden = false;
  v.onclick = e => {
    const b = e.target.closest('[data-v]');
    if(b && b.dataset.v === 'save'){ saveFile(f); return; }
    if((b && b.dataset.v === 'close') || e.target === v || e.target.classList.contains('viewer-body')){ v.hidden = true; v.innerHTML = ''; }
  };
}
async function saveFile(f){
  if(!downloads){ flash('Saving files is not available here'); return; }
  try {
    const { data, error } = await sb.storage.from(FILES_BUCKET).download(f.id);
    if(error || !data) throw new Error('missing');
    await downloads.save({filename: f.name || ('file.' + extOf(f.name).toLowerCase()), data});
  } catch(err){
    if(err && err.code === 'dismissed') return;
    flash(err && err.message === 'missing' ? 'That file is no longer available' : 'Could not save the file');
  }
}

// ---------- add ----------
$('#addInput').addEventListener('input', e => { $('#addGo').hidden = !e.target.value.trim(); });
$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#addInput').value.trim(); if(!v || !col) return;
  if(!canWrite){ setStatus('This list is read-only for you.'); return; }
  $('#addInput').value=''; $('#addGo').hidden = true;
  createTask(newId(), {title:v, important:false, priority:'normal', done:false, notes:'', steps:[], links:[], files:[], created:Date.now(), completedAt:null, order: edgeOrder(1)});
});

// ---------- search ----------
const searchEl = $('#search');
searchEl.addEventListener('input', () => { query = searchEl.value.trim(); $('#searchClear').hidden = !query; openSwipe = null; renderList(); });
searchEl.addEventListener('keydown', e => { if(e.key === 'Escape'){ searchEl.value=''; query=''; $('#searchClear').hidden = true; renderList(); } });
$('#searchClear').addEventListener('click', e => { e.preventDefault(); searchEl.value=''; query=''; $('#searchClear').hidden = true; renderList(); searchEl.focus(); });

// ---------- list clicks ----------
function onListClick(e){
  if(Date.now() < suppressUntil) return;
  const wrap = e.target.closest('.swipe'); if(!wrap) return;
  const id = wrap.dataset.id;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if(act==='swipe-del'){ e.stopPropagation(); deleteTask(id); return; }
  if(openSwipe){ openSwipe = null; renderList(); return; }
  if(act==='toggle'){ e.stopPropagation(); toggleDone(id, e.target.closest('.check')); return; }
  if(act==='star'){ e.stopPropagation(); const t=tasks.get(id); setPriority(id, t.important?'normal':'high'); return; }
  selected = id; render(true);
}
$('#list').addEventListener('click', onListClick);
$('#doneList').addEventListener('click', onListClick);
[$('#list'),$('#doneList')].forEach(l=>l.addEventListener('keydown', e=>{
  if((e.key==='Enter'||e.key===' ') && e.target.classList.contains('task')){ e.preventDefault(); selected=e.target.dataset.id; render(true); }
  if((e.key==='Delete'||e.key==='Backspace') && e.target.classList.contains('task')){ e.preventDefault(); deleteTask(e.target.dataset.id); }
}));
$('#doneToggle').addEventListener('click', ()=>{
  if(query) return;
  showDone = !showDone;
  try{ localStorage.setItem('showDone', showDone?'1':'0'); }catch(e){}
  renderList();
});

// ---------- panel events ----------
const panel = $('#panel');
panel.addEventListener('click', e => {
  const id = selected; const t = tasks.get(id); if(!t) return;
  const b = e.target.closest('[data-act],[data-p]'); if(!b) return;
  if(b.dataset.p){ setPriority(id, b.dataset.p); return; }
  const i = +b.dataset.i;
  const steps = arr(t.steps).map(s=>({...s}));
  const links = arr(t.links).map(l=>({...l}));
  const files = arr(t.files).map(f=>({...f}));
  switch(b.dataset.act){
    case 'close': selected=null; render(); break;
    case 'toggle-sel': toggleDone(id, b); break;
    case 'star-sel': setPriority(id, t.important?'normal':'high'); break;
    case 'step-toggle': steps[i].done=!steps[i].done; patch(id,{steps}); renderPanel(true); break;
    case 'step-del': steps.splice(i,1); patch(id,{steps}); renderPanel(true); break;
    case 'link-del': links.splice(i,1); patch(id,{links}); renderPanel(true); break;
    case 'due': {
      const v = b.dataset.v; const base = today0(); let d = base;
      if(v==='tomorrow') d = addDays(base,1);
      if(v==='nextweek') d = addDays(base, ((8 - base.getDay()) % 7) || 7);
      patch(id, dueFields(t, ymd(d))); renderPanel(true); break;
    }
    case 'due-clear': patch(id, dueFields(t, null)); renderPanel(true); break;
    case 'time-clear': e.preventDefault(); patch(id, {reminderAt:null, remindedAt:null}); renderPanel(true); break;
    case 'repeat': {
      const v = b.dataset.v || null;
      const f = {repeat: v};
      if(v && !t.due) f.due = ymd(today0());
      patch(id, f); renderPanel(true); break;
    }
    case 'file-open': {
      const f = files[i]; if(!f) break;
      if(IMG.test(f.type||'') || VID.test(f.type||'')) openViewer(f); else saveFile(f);
      break;
    }
    case 'file-save': if(files[i]) saveFile(files[i]); break;
    case 'file-del': {
      const [gone] = files.splice(i,1);
      patch(id,{files}); renderPanel(true);
      if(gone) purgeFiles([gone]);
      break;
    }
    case 'del': deleteTask(id); break;
  }
});
panel.addEventListener('change', e => {
  const id = selected; if(!tasks.get(id)) return;
  if(e.target.id === 'dueInput'){
    const v = e.target.value;
    patch(id, dueFields(tasks.get(id), v || null));
    e.target.blur(); renderPanel(true);
  }
  if(e.target.id === 'timeInput'){
    const t = tasks.get(id), v = e.target.value;
    if(!v){ if(t.reminderAt) patch(id, {reminderAt:null, remindedAt:null}); return; }
    const due = t.due || ymd(today0());
    const iso = withTime(due, v);
    if(iso !== t.reminderAt || due !== t.due) patch(id, {due, reminderAt: iso, remindedAt: null});
    if(!pushOn) flash('Tap the bell at the top to turn on notifications');
  }
  if(e.target.id === 'fileInput'){
    const list = [...(e.target.files||[])];
    e.target.value = '';
    if(list.length) uploadFiles(id, list);
  }
});
panel.addEventListener('submit', e => {
  e.preventDefault();
  const id = selected; const t = tasks.get(id); if(!t) return;
  if(e.target.id==='stepForm'){
    const v = $('#stepInput').value.trim(); if(!v) return;
    const steps = [...arr(t.steps), {id:'s'+Date.now().toString(36), title:v, done:false}];
    patch(id,{steps}); renderPanel(true); $('#stepInput').focus();
  }
  if(e.target.id==='linkForm'){
    let url = $('#linkUrl').value.trim(); if(!url) return;
    if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch(err){ flash('That link does not look right'); return; }
    const label = $('#linkLabel').value.trim();
    patch(id,{links:[...arr(t.links), {url, label}]}); renderPanel(true);
  }
});
let typeTimer;
function commitText(el){
  const id = selected; const t = tasks.get(id); if(!t || !el) return;
  if(el.id==='pTitle'){ const v = el.value.replace(/\s+/g,' ').trim(); if(v && v!==t.title) patch(id,{title:v}); }
  else if(el.id==='pNotes'){ if(el.value!==(t.notes||'')) patch(id,{notes:el.value}); }
  else if(el.dataset.step!=null){
    const i=+el.dataset.step; const steps=arr(t.steps).map(s=>({...s}));
    const v = el.value.trim();
    if(steps[i] && v && v!==steps[i].title){ steps[i].title=v; patch(id,{steps}); }
  }
}
const isText = el => el.id==='pTitle' || el.id==='pNotes' || el.dataset.step!=null;
panel.addEventListener('input', e => {
  if(e.target.id==='pTitle') autosize(e.target);
  if(isText(e.target)){ clearTimeout(typeTimer); const el=e.target; typeTimer=setTimeout(()=>commitText(el), 800); }
});
panel.addEventListener('focusout', e => {
  if(isText(e.target)){
    clearTimeout(typeTimer); commitText(e.target);
    setTimeout(()=>{ if(!editing()) renderPanel(true); }, 0);
  }
  if(e.target.id==='timeInput') setTimeout(()=>{ if(!editing()) renderPanel(true); }, 0);
});
panel.addEventListener('keydown', e => {
  if(e.target.id==='pTitle' && e.key==='Enter'){ e.preventDefault(); e.target.blur(); }
  if(e.target.dataset.step!=null && e.key==='Enter'){ e.preventDefault(); e.target.blur(); }
});
document.addEventListener('keydown', e => {
  if(e.key!=='Escape') return;
  if(!$('#viewer').hidden){ $('#viewer').hidden = true; $('#viewer').innerHTML=''; return; }
  if(selected && !editing()){ selected=null; render(); }
});

// ---------- drag to reorder and swipe to delete ----------
const listEl = $('#list');
function onDown(e){
  if(e.pointerType === 'mouse' && e.button !== 0) return;
  const row = e.target.closest('.swipe');
  if(!row || e.target.closest('[data-act]') || !canWrite) return;
  const d = {row, task:row.querySelector('.task'), canDrag:listEl.contains(row) && !query, startX:e.clientX, startY:e.clientY, pointerId:e.pointerId, type:e.pointerType, active:false, swiping:false};
  drag = d;
  if(e.pointerType !== 'mouse' && d.canDrag) d.timer = setTimeout(()=>{ if(drag === d && !d.swiping) beginDrag(d); }, 350);
}
listEl.addEventListener('pointerdown', onDown);
$('#doneList').addEventListener('pointerdown', onDown);
function beginDrag(d){
  if(openSwipe){ openSwipe = null; document.querySelectorAll('.swipe.open').forEach(s=>s.classList.remove('open')); }
  const rows = [...listEl.querySelectorAll('.swipe')];
  d.index = rows.indexOf(d.row);
  if(d.index < 0){ drag = null; return; }
  d.active = true;
  d.rows = rows;
  d.rects = rows.map(r => r.getBoundingClientRect());
  d.h = d.rects[d.index].height + 2;
  d.target = d.index;
  d.row.classList.add('dragging');
  document.body.classList.add('is-dragging');
  try { d.row.setPointerCapture(d.pointerId); } catch(err){}
  if(d.type !== 'mouse' && navigator.vibrate){ try { navigator.vibrate(10); } catch(err){} }
}
document.addEventListener('pointermove', e => {
  const d = drag; if(!d || e.pointerId !== d.pointerId) return;
  const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
  if(!d.active && !d.swiping){
    if(Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2){
      clearTimeout(d.timer);
      d.swiping = true;
      d.base = d.row.classList.contains('open') ? -SWIPE : 0;
      document.querySelectorAll('.swipe.open').forEach(s=>{ if(s !== d.row) s.classList.remove('open'); });
      d.task.style.transition = 'none';
    }
    else if(d.type === 'mouse'){ if(Math.abs(dy) > 5 && d.canDrag) beginDrag(d); }
    else if(Math.abs(dx) > 8 || Math.abs(dy) > 8){ clearTimeout(d.timer); drag = null; }
    if(!d.active && !d.swiping) return;
  }
  if(d.swiping){
    e.preventDefault();
    d.x = Math.min(0, Math.max(-SWIPE * 1.3, d.base + dx));
    d.task.style.transform = `translateX(${d.x}px)`;
    return;
  }
  e.preventDefault();
  const first = d.rects[0].top, last = d.rects[d.rects.length-1].bottom, me = d.rects[d.index];
  const y = Math.max(first - me.top, Math.min(last - me.bottom, dy));
  d.row.style.transform = `translateY(${y}px)`;
  const center = me.top + me.height/2 + y;
  let t = d.index;
  for(let i = 0; i < d.index; i++){ const r = d.rects[i]; if(center < r.top + r.height/2){ t = i; break; } }
  if(t === d.index){ for(let i = d.rects.length-1; i > d.index; i--){ const r = d.rects[i]; if(center > r.top + r.height/2){ t = i; break; } } }
  d.target = t;
  d.rows.forEach((r, i) => {
    if(i === d.index) return;
    let s = 0;
    if(d.index < t && i > d.index && i <= t) s = -d.h;
    if(d.index > t && i >= t && i < d.index) s = d.h;
    r.style.transform = s ? `translateY(${s}px)` : '';
  });
}, {passive:false});
document.addEventListener('touchmove', e => { if(drag && (drag.active || drag.swiping)) e.preventDefault(); }, {passive:false});
document.addEventListener('pointerdown', e => {
  if(openSwipe && !e.target.closest('.swipe.open')){ openSwipe = null; document.querySelectorAll('.swipe.open').forEach(s=>s.classList.remove('open')); }
});
function endDrag(e){
  const d = drag; if(!d || (e && e.pointerId !== d.pointerId)) return;
  clearTimeout(d.timer);
  drag = null;
  if(d.swiping){
    suppressUntil = Date.now() + 350;
    const open = (d.x || 0) < -SWIPE / 2;
    d.task.style.transition = '';
    d.task.style.transform = '';
    d.row.classList.toggle('open', open);
    openSwipe = open ? d.row.dataset.id : null;
    return;
  }
  if(!d.active) return;
  suppressUntil = Date.now() + 350;
  d.rows.forEach(r => { r.style.transform = ''; });
  d.row.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  if(d.target === d.index){ renderList(); return; }
  const open = sorted(false);
  const moved = open.splice(d.index, 1)[0];
  open.splice(d.target, 0, moved);
  const before = open[d.target-1], after = open[d.target+1];
  let o;
  if(before && after) o = (ord(before) + ord(after)) / 2;
  else if(before) o = ord(before) + 1000;
  else if(after) o = ord(after) - 1000;
  else o = 1000;
  patch(moved.id, {order:o});
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

// ---------- data ----------
function setStatus(s){ $('#status').textContent = s || ''; }
$('#list').innerHTML = `<div class="state"><strong>Loading your tasks…</strong></div>`;

// ---------- live data from Supabase ----------
let channel = null, needRefetch = false, loaded = false, openTaskId = new URLSearchParams(location.search).get('task');
async function refetch(){
  if(!user) return;
  if(inflightTotal){ needRefetch = true; return; }
  const { data, error } = await sb.from('tasks').select('*');
  if(error){ setStatus("Can't reach your saved tasks right now. They'll appear when the connection is back."); return; }
  if(inflightTotal){ needRefetch = true; return; }
  const next = new Map();
  data.forEach(r => next.set(r.id, fromRow(r)));
  if(pendingDelete) next.delete(pendingDelete.id);
  tasks = next; loaded = true; setStatus('');
  if(openTaskId && tasks.has(openTaskId)){ selected = openTaskId; openTaskId = null; history.replaceState(null, '', '/'); render(true); return; }
  if(selected && !tasks.has(selected)) selected = null;
  render();
}
function onChange(payload){
  if(payload.eventType === 'DELETE'){
    const id = payload.old && payload.old.id; if(!id || inflight.has(id)) return;
    if(!tasks.has(id)) return;
    tasks.delete(id); if(selected === id) selected = null; render(); return;
  }
  const r = payload.new; if(!r || !r.id) return;
  if(inflight.has(r.id)) return;          // our own write is still going; its final echo will follow
  if(pendingDelete && pendingDelete.id === r.id) return;
  tasks.set(r.id, fromRow(r));
  render();
}
function subscribe(){
  if(channel) sb.removeChannel(channel);
  channel = sb.channel('tasks-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
    .subscribe(status => {
      if(status === 'SUBSCRIBED') refetch();
      if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setTimeout(() => { if(user) subscribe(); }, 4000);
    });
}
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && user){ refetch(); $('#today').textContent = new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}); } });
window.addEventListener('online', () => { if(user) refetch(); });

function startData(){
  $('#list').innerHTML = `<div class="state"><strong>Loading your tasks…</strong></div>`;
  refetch();
  subscribe();
  setTimeout(()=>{ if(!loaded) setStatus("Can't reach your saved tasks yet. They'll appear when the connection is back."); }, 10000);
}

// ---------- sign in (email + password; works inside the home screen app) ----------
let signUpMode = false, recovering = false;
const authErr = m => { $('#authErr').textContent = m || ''; $('#authErr').hidden = !m; };
const authOk = m => { $('#authOk').textContent = m || ''; $('#authOk').hidden = !m; };
function setMode(up){
  signUpMode = up;
  $('#loginMsg').textContent = up ? 'Create your account. Pick a password you will remember.' : 'Sign in to see your tasks.';
  $('#loginBtn').textContent = up ? 'Create account' : 'Sign in';
  $('#modeBtn').textContent = up ? 'Already have an account? Sign in' : 'First time here? Create your account';
  $('#password').setAttribute('autocomplete', up ? 'new-password' : 'current-password');
  $('#password').placeholder = up ? 'Password (8+ characters)' : 'Password';
  $('#forgotBtn').hidden = up;
  authErr(''); authOk('');
}
$('#modeBtn').addEventListener('click', () => setMode(!signUpMode));
function niceAuthError(error){
  const m = (error && error.message) || '';
  if(/invalid login/i.test(m)) return 'Wrong email or password.';
  if(/not confirmed/i.test(m)) return 'Open the email we sent you and tap "Confirm email address" first, then sign in here.';
  if(/closed|not allowed|signups|database error/i.test(m)) return 'This list belongs to someone else.';
  if(/rate|seconds|too many/i.test(m)) return 'Too many tries. Please wait a few minutes.';
  if(/password/i.test(m)) return 'Use a password with at least 8 characters.';
  return m || 'Something went wrong. Try again.';
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); authErr(''); authOk('');
  const email = $('#email').value.trim(), password = $('#password').value;
  if(!email || !password) return;
  const btn = $('#loginBtn'); const label = btn.textContent;
  btn.disabled = true; btn.textContent = signUpMode ? 'Creating…' : 'Signing in…';
  let res;
  if(signUpMode) res = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
  else res = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = label;
  if(res.error){ authErr(niceAuthError(res.error)); return; }
  if(signUpMode && !res.data.session){
    setMode(false);
    authOk('Almost done. Open the email from Supabase and tap "Confirm email address". Then come back here and tap Sign in.');
  }
});
$('#forgotBtn').addEventListener('click', async () => {
  authErr(''); authOk('');
  const email = $('#email').value.trim();
  if(!email){ authErr('Type your email first, then tap "Forgot password?" again.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if(error){ authErr(niceAuthError(error)); return; }
  authOk('We sent you an email. Tap the link in it to choose a new password, then sign in here with it.');
});
$('#newPassForm').addEventListener('submit', async e => {
  e.preventDefault(); authErr('');
  const { error } = await sb.auth.updateUser({ password: $('#newPass').value });
  if(error){ authErr(niceAuthError(error)); return; }
  recovering = false; $('#newPassForm').hidden = true; $('#loginForm').hidden = false;
  flash('Password saved');
  showSignedIn((await sb.auth.getUser()).data.user);
});
$('#signOutBtn').addEventListener('click', async () => {
  if(!confirm('Sign out of your tasks?')) return;
  await sb.auth.signOut();
});

function showSignedIn(u){
  const was = user && user.id;
  user = u;
  if(recovering){ $('#auth').hidden = false; $('#app').hidden = true; return; }
  $('#auth').hidden = !!u; $('#app').hidden = !u;
  if(u && was !== u.id){ startData(); refreshBell(); }
  if(!u){
    if(channel){ sb.removeChannel(channel); channel = null; }
    tasks = new Map(); selected = null; loaded = false;
    $('#loginForm').hidden = false; $('#newPassForm').hidden = true; $('#password').value = '';
  }
}
sb.auth.onAuthStateChange((event, session) => {
  if(event === 'PASSWORD_RECOVERY'){
    recovering = true;
    setTimeout(() => { $('#auth').hidden = false; $('#app').hidden = true; $('#loginForm').hidden = true; $('#newPassForm').hidden = false; }, 0);
    return;
  }
  if(event === 'TOKEN_REFRESHED' && channel) sb.realtime.setAuth(session.access_token);
  // run outside the auth callback to avoid blocking supabase-js
  setTimeout(() => showSignedIn(session ? session.user : null), 0);
});

// ---------- push notifications ----------
let pushOn = false;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function b64ToBytes(b64){
  const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function setBell(on){
  pushOn = on;
  const b = $('#bellBtn');
  b.innerHTML = on ? ICON.bellOn : ICON.bell;
  b.classList.toggle('on', on);
  b.setAttribute('aria-label', on ? 'Notifications are on. Send a test' : 'Turn on notifications');
}
async function refreshBell(){
  setBell(false);
  if(!pushSupported || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){ await saveSub(sub); setBell(true); }
  } catch(err){}
}
async function saveSub(sub){
  const j = sub.toJSON();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto';
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, tz }, { onConflict: 'endpoint' });
  if(error) throw error;
}
function info(msg, ms = 9000){ showToast(msg, ms, null); }
$('#bellBtn').addEventListener('click', async () => {
  if(!pushSupported){
    info(isIOS && !standalone
      ? 'First add this app to your Home Screen: tap Share, then "Add to Home Screen". Open it from there and tap the bell again.'
      : 'This browser cannot show notifications.');
    return;
  }
  try {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if(perm !== 'granted'){ info(isIOS ? 'Notifications are blocked. Turn them on in Settings > Notifications > Tasks.' : 'Notifications are blocked for this site in your browser settings.'); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
    await saveSub(sub);
    setBell(true);
    const { data, error } = await sb.functions.invoke('send-reminders', { body: { test: true } });
    if(error || !data || !data.sent) flash('Notifications are on');
    else flash('Notifications are on. Sent a test.');
  } catch(err){
    console.error(err);
    info('Could not turn on notifications. Try again in a moment.');
  }
});

// Open a task when a notification is tapped.
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
  navigator.serviceWorker.addEventListener('message', e => {
    const id = e.data && e.data.task;
    if(id && tasks.has(id)){ selected = id; render(true); }
    else if(id){ openTaskId = id; refetch(); }
  });
}

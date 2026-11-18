// Mood tab: a daily mood log with a month calendar of faces, a mood count gauge and a month chart.
export const MOODS = [
  { v: 5, label: 'Great', color: '#5aa86a' },
  { v: 4, label: 'Good', color: '#b3c547' },
  { v: 3, label: 'Okay', color: '#efbf45' },
  { v: 2, label: 'Bad', color: '#e88d3a' },
  { v: 1, label: 'Awful', color: '#df4747' },
];
const M = Object.fromEntries(MOODS.map(m => [m.v, m]));
const INK = 'rgba(25,30,25,.78)';

// Original face drawings, one per mood (viewBox 0 0 40 40).
export function face(v, size = 40, extra = '') {
  if (!v) return `<svg class="face empty" width="${size}" height="${size}" viewBox="0 0 40 40" ${extra}><circle cx="20" cy="20" r="18.5" fill="currentColor" opacity=".13"/></svg>`;
  const c = M[v].color;
  const eyes = {
    5: `<path d="M11.5 17.5q2.5-3.6 5 0M23.5 17.5q2.5-3.6 5 0" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    4: `<circle cx="14" cy="17" r="2.2" fill="${INK}"/><circle cx="26" cy="17" r="2.2" fill="${INK}"/>`,
    3: `<circle cx="14" cy="17" r="2.2" fill="${INK}"/><circle cx="26" cy="17" r="2.2" fill="${INK}"/>`,
    2: `<circle cx="14" cy="17.5" r="2.2" fill="${INK}"/><circle cx="26" cy="17.5" r="2.2" fill="${INK}"/>`,
    1: `<path d="M11.5 14.5l4.5 2.5-4.5 2.5M28.5 14.5L24 17l4.5 2.5" stroke="${INK}" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  }[v];
  const mouth = {
    5: `<path d="M12 23.5h16q-1 8-8 8t-8-8z" fill="${INK}"/><path d="M15.5 28.4q4.5 2.6 9 0" stroke="${c}" stroke-width="1.6" fill="none" opacity=".55"/>`,
    4: `<path d="M13.5 24.5q6.5 5.5 13 0" stroke="${INK}" stroke-width="2.3" fill="none" stroke-linecap="round"/>`,
    3: `<path d="M14 26.5h12" stroke="${INK}" stroke-width="2.3" stroke-linecap="round"/>`,
    2: `<path d="M14 28.5q6-5 12 0" stroke="${INK}" stroke-width="2.3" fill="none" stroke-linecap="round"/>`,
    1: `<path d="M13 29.5q7-7.5 14 0" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  }[v];
  return `<svg class="face" width="${size}" height="${size}" viewBox="0 0 40 40" ${extra}><circle cx="20" cy="20" r="18.5" fill="${c}"/>${eyes}${mouth}</svg>`;
}

export function initMood({ sb, $, esc, flash, getUser }) {
  let entries = new Map(); // 'YYYY-MM-DD' -> row
  let loaded = false, visible = false, channel = null, pending = null;
  let month = firstOfMonth(new Date());
  let settings = null;
  let picking = null; // { day, mood, note }
  // Horoscope card (from Astrology.com via the horoscope function)
  const HS = [['yesterday', 'Yesterday'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['nextweek', 'Next week']];
  let hs = null, hsAt = 0, hsBusy = false;
  let hsPeriod = 'today', hsOpen = true;
  try { hsOpen = localStorage.getItem('hsOpen') !== '0'; } catch (e) { /* default */ }
  async function loadHoroscope(force) {
    if (hsBusy || (!force && hs && Date.now() - hsAt < 3600000)) return;
    hsBusy = true;
    try {
      const { data, error } = await sb.functions.invoke('horoscope', { body: { sign: 'capricorn' } });
      if (!error && data && !data.error) { hs = data; hsAt = Date.now(); }
    } finally { hsBusy = false; }
    renderHoroscope();
  }
  function horoscopeHTML() {
    const cur = hs && hs[hsPeriod];
    const paras = cur && cur.text ? cur.text.split(/\n{2,}/).map(t => `<p>${esc(t)}</p>`).join('') : '';
    const first = cur && cur.text ? esc(cur.text.split(/(?<=[.!?])\s/)[0]) : '';
    return `<div class="md-card hs ${hsOpen ? 'open' : ''}" id="hsCard">
      <button class="hs-head" data-hs="toggle" aria-expanded="${hsOpen}">
        <span class="hs-sign" aria-hidden="true">♑</span>
        <span class="hs-title"><b>Capricorn</b><small>${cur && cur.date ? esc(cur.date) : hs ? '' : 'Loading your horoscope…'}</small></span>
        <svg class="hs-chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4.5l3 3 3-3"/></svg>
      </button>
      ${hsOpen ? `<div class="seg hs-tabs">${HS.map(([v, l]) => `<button data-hsp="${v}" class="${hsPeriod === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="hs-text">${paras || (hs ? `<p class="note">${cur && cur.error ? "Couldn't load this one right now." : 'Nothing here yet.'}</p>` : '<p class="note">Loading…</p>')}</div>
        ${cur && cur.url ? `<a class="hs-src" href="${esc(cur.url)}" target="_blank" rel="noopener">Read on Astrology.com</a>` : ''}`
      : (first ? `<p class="hs-peek">${first}</p>` : '')}
    </div>`;
  }
  function renderHoroscope() {
    const el = document.getElementById('hsCard');
    if (el) el.outerHTML = horoscopeHTML();
  }

  const pad = n => String(n).padStart(2, '0');
  const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fromKey = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayKey = () => key(new Date());

  async function load() {
    const { data, error } = await sb.from('mood_entries').select('*').order('day');
    if (error) { $('#moodBody').innerHTML = `<div class="state"><strong>Can't load your moods right now.</strong></div>`; return; }
    entries = new Map(data.map(r => [r.day, r]));
    loaded = true;
    render();
    if (pending) { const d = pending; pending = null; openPicker(d); }
  }
  async function loadSettings() {
    const { data } = await sb.from('user_settings').select('mood_reminder_enabled,mood_hour').maybeSingle();
    settings = data || { mood_reminder_enabled: true, mood_hour: 21 };
    renderBody();
  }
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('mood-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mood_entries' }, p => {
        if (p.eventType === 'DELETE') { for (const [k, r] of entries) if (r.id === p.old.id) entries.delete(k); }
        else entries.set(p.new.day, p.new);
        renderBody();
      })
      .subscribe(s => { if (s === 'SUBSCRIBED' && loaded) load(); });
  }

  // ---------- stats ----------
  function monthEntries() {
    const y = month.getFullYear(), m = month.getMonth();
    return [...entries.values()].filter(r => { const d = fromKey(r.day); return d.getFullYear() === y && d.getMonth() === m; });
  }
  function streak() {
    let d = new Date();
    if (!entries.has(key(d))) d = addDays(d, -1);
    let n = 0;
    while (entries.has(key(d))) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- render ----------
  function render() { if (!visible) return; renderHead(); renderBody(); }
  function renderHead() {
    $('#moodMonth').textContent = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    $('#moodNext').disabled = firstOfMonth(new Date()) <= month;
  }
  function renderBody() {
    if (!visible) return;
    if (!loaded) { $('#moodBody').innerHTML = '<div class="state"><strong>Loading…</strong></div>'; return; }
    const list = monthEntries();
    $('#moodBody').innerHTML = horoscopeHTML() + todayCard() + calendarCard() + countCard(list) + chartCard(list) + statsCard(list) + reminderCard();
  }
  function todayCard() {
    const t = entries.get(todayKey());
    if (t) return `<div class="md-card md-today done">${face(t.mood, 44)}<div><b>Today: ${M[t.mood].label}</b><span>${t.note ? esc(t.note) : 'Tap to add a note or change it.'}</span></div><button class="md-link" data-day="${todayKey()}">Edit</button></div>`;
    return `<div class="md-card md-today"><b>How was your day?</b><div class="md-quick">${MOODS.map(m => `<button data-quick="${m.v}" aria-label="${m.label}">${face(m.v, 46)}<span>${m.label}</span></button>`).join('')}</div></div>`;
  }
  function calendarCard() {
    const start = addDays(month, -month.getDay()), today = new Date(), tk = todayKey();
    const weeks = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
    const dows = Array.from({ length: 7 }, (_, i) => `<span>${addDays(start, i).toLocaleDateString(undefined, { weekday: 'short' })}</span>`).join('');
    const cells = Array.from({ length: weeks * 7 }, (_, i) => {
      const d = addDays(start, i), k = key(d), e = entries.get(k), other = d.getMonth() !== month.getMonth(), future = d > today;
      return `<button class="md-day ${other ? 'other' : ''} ${future ? 'future' : ''} ${k === tk ? 'today' : ''}" ${future ? 'disabled' : `data-day="${k}"`}>
        ${face(e && e.mood, 40)}<span>${other && d.getDate() === 1 ? d.toLocaleDateString(undefined, { month: 'short' }) : d.getDate()}</span></button>`;
    }).join('');
    return `<div class="md-card"><div class="md-dows">${dows}</div><div class="md-grid">${cells}</div></div>`;
  }
  function countCard(list) {
    const counts = Object.fromEntries(MOODS.map(m => [m.v, list.filter(r => r.mood === m.v).length]));
    const total = list.length, R = 80, L = Math.PI * R;
    let at = 0;
    const arcs = total ? MOODS.map(m => {
      const len = counts[m.v] / total * L;
      const p = `<path d="M20 100 A${R} ${R} 0 0 1 180 100" fill="none" stroke="${m.color}" stroke-width="26" stroke-dasharray="${len} ${L}" stroke-dashoffset="${-at}"/>`;
      at += len; return len > 0 ? p : '';
    }).join('') : `<path d="M20 100 A${R} ${R} 0 0 1 180 100" fill="none" stroke="currentColor" opacity=".12" stroke-width="26"/>`;
    return `<div class="md-card"><h3>Mood count</h3>
      <svg class="md-gauge" viewBox="0 0 200 112">${arcs}<text x="100" y="96" text-anchor="middle" class="md-total">${total}</text><text x="100" y="110" text-anchor="middle" class="md-sub">days logged</text></svg>
      <div class="md-legend">${MOODS.map(m => `<div>${face(m.v, 38)}<b style="background:${m.color}">${counts[m.v]}</b><span>${m.label}</span></div>`).join('')}</div></div>`;
  }
  function chartCard(list) {
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const W = 320, H = 170, L = 34, R = 10, T = 12, B = 24, w = W - L - R, h = H - T - B;
    const x = d => L + (d - 1) / (days - 1) * w, y = v => T + (5 - v) / 4 * h;
    const pts = list.map(r => ({ d: fromKey(r.day).getDate(), v: r.mood })).sort((a, b) => a.d - b.d);
    const grid = MOODS.map(m => `<line x1="${L}" x2="${W - R}" y1="${y(m.v)}" y2="${y(m.v)}" class="md-gl"/><g transform="translate(${L - 30},${y(m.v) - 11})">${face(m.v, 22)}</g>`).join('');
    const ticks = [1, 8, 15, 22, days].map(d => `<text x="${x(d)}" y="${H - 6}" text-anchor="middle" class="md-tick">${d}</text>`).join('');
    const line = pts.length > 1 ? `<polyline points="${pts.map(p => `${x(p.d)},${y(p.v)}`).join(' ')}" class="md-line"/>` : '';
    const dots = pts.map(p => `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4.5" fill="${M[p.v].color}" class="md-dot"/>`).join('');
    return `<div class="md-card"><h3>Mood chart</h3>${pts.length ? `<svg class="md-chart" viewBox="0 0 ${W} ${H}">${grid}${line}${dots}${ticks}</svg>` : '<p class="note">Log a few days to see your chart.</p>'}</div>`;
  }
  function statsCard(list) {
    const avg = list.length ? list.reduce((s, r) => s + r.mood, 0) / list.length : 0;
    const s = streak();
    return `<div class="md-card md-stats">
      <div>${avg ? face(Math.round(avg), 34) : face(0, 34)}<b>${avg ? avg.toFixed(1) : '–'}</b><span>Average${avg ? ' · ' + M[Math.round(avg)].label : ''}</span></div>
      <div><span class="md-big">🔥</span><b>${s}</b><span>Day streak</span></div>
      <div><span class="md-big">📝</span><b>${entries.size}</b><span>Days logged</span></div></div>`;
  }
  function reminderCard() {
    const s = settings || { mood_reminder_enabled: true, mood_hour: 21 };
    const val = s.mood_reminder_enabled ? String(s.mood_hour) : 'off';
    const opts = [['off', 'Off'], ...[17, 18, 19, 20, 21, 22, 23].map(h => [String(h), new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })])];
    return `<div class="md-card md-rem"><span>Daily check-in reminder</span><select id="moodHour">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  }

  // ---------- picker ----------
  function openPicker(day) {
    if (!loaded) { pending = day; return; }
    const e = entries.get(day);
    picking = { day, mood: e ? e.mood : 0, note: e ? e.note : '' };
    const d = fromKey(day), isToday = day === todayKey();
    const el = $('#moodSheet');
    el.innerHTML = `<div class="sh-card md-pick" role="dialog" aria-modal="true">
      <div class="sh-bar"><button class="sh-x" data-m="close" aria-label="Close"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
        <span class="sh-t">${isToday ? 'Today' : esc(d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</span>
        <button class="sh-btn primary" data-m="save">Save</button></div>
      <div class="sh-body">
        <h2 class="md-q">${isToday ? 'How was your day?' : 'How was this day?'}</h2>
        <div class="md-faces">${MOODS.map(m => `<button data-pick="${m.v}" class="${picking.mood === m.v ? 'on' : ''}" style="--c:${m.color}">${face(m.v, 54)}<span>${m.label}</span></button>`).join('')}</div>
        <textarea id="moodNote" class="ed-notes" placeholder="Add a note (optional)">${esc(picking.note)}</textarea>
        ${e ? '<button class="ed-del" data-m="delete">Delete this entry</button>' : ''}
      </div></div>`;
    el.hidden = false;
    document.body.classList.add('sheet-open');
  }
  function closePicker() { picking = null; $('#moodSheet').hidden = true; $('#moodSheet').innerHTML = ''; document.body.classList.remove('sheet-open'); }
  async function save(day, mood, note) {
    const user = getUser(); if (!user) return;
    const row = { user_id: user.id, day, mood, note: note || '', updated_at: new Date().toISOString() };
    const prev = entries.get(day);
    entries.set(day, { ...(prev || {}), ...row });
    renderBody();
    const { data, error } = await sb.from('mood_entries').upsert(row, { onConflict: 'user_id,day' }).select().single();
    if (error) { if (prev) entries.set(day, prev); else entries.delete(day); renderBody(); flash('Could not save your mood'); return; }
    entries.set(day, data); renderBody();
    flash(`${M[mood].label} saved`);
  }

  // ---------- events ----------
  $('#moodPrev').addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); render(); });
  $('#moodNext').addEventListener('click', () => { if (firstOfMonth(new Date()) > month) { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); render(); } });
  $('#moodBody').addEventListener('click', e => {
    const hp = e.target.closest('[data-hsp]');
    if (hp) { hsPeriod = hp.dataset.hsp; renderHoroscope(); return; }
    if (e.target.closest('[data-hs="toggle"]')) { hsOpen = !hsOpen; try { localStorage.setItem('hsOpen', hsOpen ? '1' : '0'); } catch (err) { /* ignore */ } renderHoroscope(); return; }
    const q = e.target.closest('[data-quick]');
    if (q) { save(todayKey(), Number(q.dataset.quick), ''); return; }
    const d = e.target.closest('[data-day]');
    if (d) openPicker(d.dataset.day);
  });
  $('#moodBody').addEventListener('change', async e => {
    if (e.target.id !== 'moodHour') return;
    const v = e.target.value, user = getUser();
    const row = v === 'off' ? { user_id: user.id, mood_reminder_enabled: false } : { user_id: user.id, mood_reminder_enabled: true, mood_hour: Number(v) };
    const { data, error } = await sb.from('user_settings').upsert(row).select('mood_reminder_enabled,mood_hour').single();
    if (error) { flash('Could not save'); return; }
    settings = data;
    flash(v === 'off' ? 'Check-in reminder off' : 'Reminder at ' + e.target.selectedOptions[0].textContent);
  });
  $('#moodSheet').addEventListener('click', async e => {
    if (e.target.id === 'moodSheet') { closePicker(); return; }
    const p = e.target.closest('[data-pick]');
    if (p && picking) {
      picking.mood = Number(p.dataset.pick);
      document.querySelectorAll('.md-faces button').forEach(b => b.classList.toggle('on', b === p));
      return;
    }
    const a = e.target.closest('[data-m]'); if (!a || !picking) return;
    if (a.dataset.m === 'close') closePicker();
    if (a.dataset.m === 'save') {
      if (!picking.mood) { flash('Pick a mood first'); return; }
      const { day, mood } = picking, note = $('#moodNote').value.trim();
      closePicker(); save(day, mood, note);
    }
    if (a.dataset.m === 'delete') {
      const r = entries.get(picking.day); closePicker();
      if (!r) return;
      entries.delete(r.day); renderBody();
      const { error } = await sb.from('mood_entries').delete().eq('id', r.id);
      if (error) { entries.set(r.day, r); renderBody(); flash('Could not delete'); } else flash('Entry deleted');
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && picking) closePicker(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && visible) { renderBody(); loadHoroscope(); } });

  return {
    show() { visible = true; render(); if (!loaded) load(); loadHoroscope(); },
    hide() { visible = false; },
    start() { loaded = false; entries = new Map(); load(); subscribe(); loadSettings(); },
    stop() { if (channel) sb.removeChannel(channel); channel = null; entries = new Map(); loaded = false; closePicker(); },
    open(day) { openPicker(day === 'today' ? todayKey() : day); },
  };
}

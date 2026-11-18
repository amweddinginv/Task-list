// Calendar tab: Outlook-style views over public.calendar_events (synced with Outlook by the outlook-sync function).
export function initCalendar({ sb, $, esc, flash, info, getUser }) {
  const VIEWS = [['agenda', 'Agenda'], ['day', 'Day'], ['3day', '3 Day'], ['week', 'Week'], ['month', 'Month']];
  const HOUR = 48; // px per hour in the time grid
  const CATS = {
    'Red category': '#d13438', 'Orange category': '#ca5010', 'Yellow category': '#c19c00',
    'Green category': '#107c10', 'Blue category': '#0f6cbd', 'Purple category': '#8764b8',
  };
  const PALETTE = ['#0f6cbd', '#8764b8', '#ca5010', '#107c10', '#c239b3', '#038387', '#d13438', '#986f0b'];
  const REMINDERS = [[null, 'None'], [0, 'At time of event'], [5, '5 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'],
    [60, '1 hour before'], [120, '2 hours before'], [1440, '1 day before'], [10080, '1 week before']];
  const SHOWAS = [['free', 'Free'], ['workingElsewhere', 'Working elsewhere'], ['tentative', 'Tentative'], ['busy', 'Busy'], ['oof', 'Away']];
  const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const I = {
    left: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 3L5 8l5 5"/></svg>',
    right: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 3l5 5-5 5"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    pin: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 14.5s4.5-4.3 4.5-8a4.5 4.5 0 00-9 0c0 3.7 4.5 8 4.5 8z"/><circle cx="8" cy="6.5" r="1.6"/></svg>',
    clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
    people: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6" cy="5.5" r="2.3"/><path d="M1.8 13.5c.5-2.4 2.2-3.6 4.2-3.6s3.7 1.2 4.2 3.6"/><circle cx="11.5" cy="6" r="1.8"/><path d="M11 9.9c1.7 0 2.9 1 3.3 3"/></svg>',
    bell: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V7a4 4 0 018 0v4l1 1.5H3z"/><path d="M6.5 14a1.6 1.6 0 003 0"/></svg>',
    repeat: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5V5a2 2 0 012-2h6M8.5 1.5L10 3 8.5 4.5M10 6.5V7a2 2 0 01-2 2H2M3.5 10.5L2 9l1.5-1.5"/></svg>',
    video: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="1.5" y="4" width="9" height="8" rx="1.5"/><path d="M10.5 7l4-2.2v6.4l-4-2.2z"/></svg>',
    note: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.5 2h6l3 3v9h-9z"/><path d="M5.5 8h5M5.5 10.5h4"/></svg>',
    sync: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 6.5A5 5 0 004 4.5L2.5 6M3 9.5a5 5 0 009 2l1.5-1.5"/><path d="M2.5 3v3h3M13.5 13v-3h-3"/></svg>',
    outlook: '<svg viewBox="0 0 16 16"><rect x="1" y="3" width="9" height="10" rx="1.5" fill="#0f6cbd"/><ellipse cx="5.5" cy="8" rx="2.2" ry="2.6" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M10 5h4.2a.8.8 0 01.8.8v4.4a.8.8 0 01-.8.8H10" fill="none" stroke="#0f6cbd" stroke-width="1.3"/></svg>',
    lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>',
    check: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-5"/></svg>',
  };

  // ---------- state ----------
  let events = new Map();
  let view = localStorage.getItem('calView') || (innerWidth < 700 ? 'agenda' : 'week');
  let cursor = startOfDay(new Date());
  let agendaDays = 45;
  let status = null;
  let channel = null, loaded = false, visible = false, pendingOpen = null;
  let sheet = null; // {mode:'details'|'edit'|'outlook', id}
  let didScroll = false;

  // ---------- dates ----------
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeek(d) { return addDays(startOfDay(d), -startOfDay(d).getDay()); }
  const pad = n => String(n).padStart(2, '0');
  const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fromKey = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const sameDay = (a, b) => key(a) === key(b);
  const fmtTime = d => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const fmtDay = (d, o = {}) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...o });
  const toDateInput = d => key(d);
  const toTimeInput = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const combine = (dateStr, timeStr) => { const d = fromKey(dateStr); const [h, m] = (timeStr || '00:00').split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
  function relDay(d) {
    const n = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  }

  // ---------- events ----------
  const S = e => new Date(e.start_at), E = e => new Date(e.end_at);
  function visibleEvents() {
    const deletedMasters = new Set([...events.values()].filter(e => e.event_type === 'seriesMaster' && e.sync_state === 'pending_delete').map(e => e.outlook_id));
    return [...events.values()].filter(e => e.event_type !== 'seriesMaster' && e.sync_state !== 'pending_delete' && !(e.series_master_id && deletedMasters.has(e.series_master_id)));
  }
  // A pending repeating event (not in Outlook yet) shows only once; Outlook expands it after sync.
  function onDay(list, day) {
    const a = startOfDay(day), b = addDays(a, 1);
    return list.filter(e => S(e) < b && (E(e) > a || (+E(e) === +S(e) && S(e) >= a)));
  }
  function sortEv(list) { return list.sort((x, y) => (y.is_all_day - x.is_all_day) || (S(x) - S(y)) || (E(y) - E(x))); }
  function color(e) {
    const c = (e.categories || [])[0];
    if (c && CATS[c]) return CATS[c];
    if (c) { let h = 0; for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
    return '#0f6cbd';
  }
  const evStyle = e => `--ev:${color(e)}`;
  const evCls = e => ['ev', e.show_as === 'tentative' || e.response_status === 'notResponded' ? 'tent' : '', e.show_as === 'free' ? 'free' : '',
    e.is_cancelled ? 'cancelled' : '', e.sync_state === 'error' ? 'err' : ''].join(' ');
  const title = e => (e.is_cancelled ? 'Canceled: ' : '') + (e.subject || '(No title)');
  function timeRange(e) {
    if (e.is_all_day) {
      const days = Math.round((startOfDay(E(e)) - startOfDay(S(e))) / 86400000);
      return days > 1 ? `${relDay(S(e))} – ${relDay(addDays(E(e), -1))} · All day` : `${fmtDay(S(e))} · All day`;
    }
    if (sameDay(S(e), E(e)) || +E(e) === +startOfDay(addDays(S(e), 1))) return `${fmtDay(S(e))} · ${fmtTime(S(e))} – ${fmtTime(E(e))}`;
    return `${fmtDay(S(e), { weekday: 'short', month: 'short' })}, ${fmtTime(S(e))} – ${fmtDay(E(e), { weekday: 'short', month: 'short' })}, ${fmtTime(E(e))}`;
  }
  function recText(rec) {
    if (!rec || !rec.pattern) return '';
    const p = rec.pattern, r = rec.range || {}, n = p.interval || 1;
    const days = (p.daysOfWeek || []).map(d => d[0].toUpperCase() + d.slice(1, 3));
    let t;
    switch (p.type) {
      case 'daily': t = n === 1 ? 'Every day' : `Every ${n} days`; break;
      case 'weekly':
        t = (p.daysOfWeek || []).length === 5 && !p.daysOfWeek.includes('saturday') && !p.daysOfWeek.includes('sunday') && n === 1 ? 'Every weekday'
          : (n === 1 ? 'Every week' : `Every ${n} weeks`) + (days.length ? ' on ' + days.join(', ') : ''); break;
      case 'absoluteMonthly': t = (n === 1 ? 'Every month' : `Every ${n} months`) + ` on day ${p.dayOfMonth}`; break;
      case 'relativeMonthly': t = (n === 1 ? 'Every month' : `Every ${n} months`) + ` on the ${p.index} ${days.join(', ')}`; break;
      case 'absoluteYearly': t = 'Every year'; break;
      case 'relativeYearly': t = `Every year on the ${p.index} ${days.join(', ')}`; break;
      default: t = 'Repeats';
    }
    if (r.type === 'endDate' && r.endDate) t += ` until ${fromKey(r.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    if (r.type === 'numbered' && r.numberOfOccurrences) t += `, ${r.numberOfOccurrences} times`;
    return t;
  }
  const master = e => e.series_master_id ? [...events.values()].find(m => m.outlook_id === e.series_master_id) : null;

  // ---------- data ----------
  async function load() {
    const from = addDays(new Date(), -120).toISOString(), to = addDays(new Date(), 430).toISOString();
    const { data, error } = await sb.from('calendar_events').select('*')
      .or(`event_type.eq.seriesMaster,and(start_at.gte.${from},start_at.lte.${to})`).limit(5000);
    if (error) { $('#calStatus').textContent = "Can't load your calendar right now."; return; }
    events = new Map(data.map(e => [e.id, e]));
    loaded = true;
    render();
    if (pendingOpen) { const id = pendingOpen; pendingOpen = null; openEvent(id); }
  }
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('cal-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, p => {
        if (p.eventType === 'DELETE') events.delete(p.old.id); else events.set(p.new.id, p.new);
        schedule();
      })
      .subscribe(s => { if (s === 'SUBSCRIBED' && loaded) load(); });
  }
  let raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { renderBody(); if (sheet && sheet.mode === 'details') renderDetails(sheet.id); }); }
  async function loadStatus() {
    const { data } = await sb.rpc('outlook_status');
    status = data || { connected: false };
    renderStatus();
  }
  async function callSync(body) {
    const { data, error } = await sb.functions.invoke('outlook-sync', { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch (e) { /* keep */ }
      throw new Error(msg);
    }
    return data;
  }

  // ---------- header ----------
  function headTitle() {
    if (view === 'month' || view === 'agenda') return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (view === 'day') return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const days = view === 'week' ? 7 : 3, a = view === 'week' ? startOfWeek(cursor) : cursor, b = addDays(a, days - 1);
    return a.getMonth() === b.getMonth() ? a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `${a.toLocaleDateString(undefined, { month: 'short' })} – ${b.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  }
  function renderHead() {
    $('#calTitle').textContent = headTitle();
    $('#calViews').innerHTML = VIEWS.map(([v, l]) => `<button data-view="${v}" class="${view === v ? 'on' : ''}">${l}</button>`).join('');
  }
  function renderStatus() {
    const b = $('#calOutlook');
    if (!status) { b.innerHTML = I.outlook; return; }
    b.innerHTML = I.outlook + `<span>${!status.connected ? 'Connect Outlook' : status.last_error ? 'Fix sync' : 'Outlook'}</span>`;
    b.classList.toggle('warn', !!(status.connected && status.last_error));
    const pend = [...events.values()].filter(e => e.sync_state === 'error').length;
    $('#calStatus').textContent = status.connected && status.last_error ? 'Outlook sync has a problem. Tap "Fix sync".'
      : pend ? `${pend} event${pend > 1 ? 's' : ''} couldn't sync to Outlook. Open ${pend > 1 ? 'them' : 'it'} to retry.` : '';
    if (sheet && sheet.mode === 'outlook') renderOutlookSheet();
  }
  function move(dir) {
    const step = { day: 1, '3day': 3, week: 7, agenda: 7 }[view];
    if (view === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
    else cursor = addDays(cursor, dir * step);
    render();
  }

  // ---------- render ----------
  function render() { if (!visible) return; renderHead(); renderBody(); renderStatus(); }
  function renderBody() {
    if (!visible) return;
    const body = $('#calBody');
    if (!loaded) { body.innerHTML = '<div class="state"><strong>Loading your calendar…</strong></div>'; return; }
    if (view === 'month') body.innerHTML = monthHTML();
    else if (view === 'agenda') body.innerHTML = agendaHTML();
    else {
      const prev = $('#tgScroll') ? $('#tgScroll').scrollTop : null;
      body.innerHTML = gridHTML();
      const sc = $('#tgScroll');
      if (prev != null && didScroll) sc.scrollTop = prev;
      else { const now = new Date(); sc.scrollTop = Math.max(0, ((sameDay(now, cursor) || view !== 'day' ? Math.min(now.getHours(), 17) : 8) - 1) * HOUR); didScroll = true; }
    }
    $('#calTitle').textContent = headTitle();
  }

  function layoutDay(list, day) {
    const a = startOfDay(day), b = addDays(a, 1);
    const items = list.map(e => ({ e, s: Math.max(+S(e), +a), t: Math.min(+E(e), +b) }))
      .map(x => ({ ...x, t: Math.max(x.t, x.s + 20 * 60000) }))
      .sort((x, y) => x.s - y.s || y.t - x.t);
    const out = [];
    let cluster = [], cols = [], clusterEnd = 0;
    const flush = () => { cluster.forEach(x => x.n = cols.length); out.push(...cluster); cluster = []; cols = []; };
    for (const it of items) {
      if (cluster.length && it.s >= clusterEnd) flush();
      let c = cols.findIndex(end => end <= it.s);
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = it.t; it.c = c; cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.t);
    }
    flush();
    return out.map(x => ({ ...x, top: (x.s - a) / 3600000 * HOUR, h: Math.max(20, (x.t - x.s) / 3600000 * HOUR - 2) }));
  }
  function gridHTML() {
    const n = view === 'day' ? 1 : view === '3day' ? 3 : 7;
    const first = view === 'week' ? startOfWeek(cursor) : cursor;
    const days = Array.from({ length: n }, (_, i) => addDays(first, i));
    const vis = visibleEvents(), today = new Date();
    const head = days.map(d => `<button class="tg-dh ${sameDay(d, today) ? 'today' : ''}" data-goday="${key(d)}"><span>${d.toLocaleDateString(undefined, { weekday: 'short' })}</span><b>${d.getDate()}</b></button>`).join('');
    const allday = days.map(d => {
      const list = sortEv(onDay(vis, d).filter(e => e.is_all_day || (E(e) - S(e)) >= 86400000));
      return `<div class="tg-ad" data-day="${key(d)}">${list.map(e => `<button class="${evCls(e)} chip" style="${evStyle(e)}" data-ev="${e.id}">${esc(title(e))}</button>`).join('')}</div>`;
    }).join('');
    const cols = days.map(d => {
      const list = onDay(vis, d).filter(e => !e.is_all_day && (E(e) - S(e)) < 86400000);
      const blocks = layoutDay(list, d).map(x => {
        const e = x.e, short = x.h < 38;
        return `<button class="${evCls(e)} blk ${short ? 'short' : ''}" style="${evStyle(e)};top:${x.top}px;height:${x.h}px;left:calc(${x.c / x.n * 100}% + 1px);width:calc(${100 / x.n}% - 3px)" data-ev="${e.id}">
          <b>${esc(title(e))}</b>${short ? ` <span>${fmtTime(S(e))}</span>` : `<span>${fmtTime(S(e))} – ${fmtTime(E(e))}</span>${e.location ? `<span>${esc(e.location)}</span>` : ''}`}${e.sync_state && e.sync_state.startsWith('pending') ? '<i class="pend"></i>' : ''}</button>`;
      }).join('');
      const nowLine = sameDay(d, today) ? `<div class="now" style="top:${(today - startOfDay(today)) / 3600000 * HOUR}px"></div>` : '';
      return `<div class="tg-col ${sameDay(d, today) ? 'today' : ''}" data-day="${key(d)}">${blocks}${nowLine}</div>`;
    }).join('');
    const hours = Array.from({ length: 24 }, (_, h) => `<div class="tg-h" style="top:${h * HOUR}px">${h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}</div>`).join('');
    return `<div class="tg" style="--n:${n};--hour:${HOUR}px">
      <div class="tg-row tg-head"><div class="tg-gut"></div>${head}</div>
      <div class="tg-row tg-adrow"><div class="tg-gut">all day</div>${allday}</div>
      <div class="tg-scroll" id="tgScroll"><div class="tg-row tg-grid" style="height:${24 * HOUR}px"><div class="tg-gut tg-hours">${hours}</div>${cols}</div></div>
    </div>`;
  }
  function monthHTML() {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1), start = startOfWeek(first), today = new Date();
    const vis = visibleEvents();
    const dows = Array.from({ length: 7 }, (_, i) => `<div class="mo-dow">${addDays(start, i).toLocaleDateString(undefined, { weekday: 'short' })}</div>`).join('');
    const cells = Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i), list = sortEv(onDay(vis, d)), max = innerWidth < 600 ? 2 : 3;
      return `<div class="mo-cell ${d.getMonth() !== first.getMonth() ? 'other' : ''} ${sameDay(d, today) ? 'today' : ''}" data-goday="${key(d)}">
        <span class="mo-num">${d.getDate()}</span>
        ${list.slice(0, max).map(e => `<button class="${evCls(e)} mo-ev ${e.is_all_day ? 'allday' : ''}" style="${evStyle(e)}" data-ev="${e.id}">${e.is_all_day ? '' : `<i>${fmtTime(S(e)).replace(/:00| /g, '').toLowerCase()}</i> `}${esc(title(e))}</button>`).join('')}
        ${list.length > max ? `<span class="mo-more">+${list.length - max} more</span>` : ''}</div>`;
    }).join('');
    return `<div class="mo"><div class="mo-head">${dows}</div><div class="mo-grid">${cells}</div></div>`;
  }
  function agendaHTML() {
    const vis = visibleEvents(), today = new Date();
    let out = '';
    for (let i = 0; i < agendaDays; i++) {
      const d = addDays(cursor, i), list = sortEv(onDay(vis, d));
      if (!list.length && !sameDay(d, today) && i !== 0) continue;
      out += `<div class="ag-day ${sameDay(d, today) ? 'today' : ''}"><div class="ag-date" data-goday="${key(d)}">${sameDay(d, today) ? 'Today · ' : sameDay(d, addDays(today, 1)) ? 'Tomorrow · ' : ''}${fmtDay(d)}</div>
        ${list.length ? list.map(e => `<button class="ag-ev ${e.is_cancelled ? 'cancelled' : ''}" data-ev="${e.id}">
          <span class="ag-time">${e.is_all_day ? 'All day' : `${fmtTime(S(e))}<small>${Math.round((E(e) - S(e)) / 60000) >= 60 ? (Math.round((E(e) - S(e)) / 360000) / 10) + ' h' : Math.round((E(e) - S(e)) / 60000) + ' min'}</small>`}</span>
          <span class="ag-bar" style="background:${color(e)}"></span>
          <span class="ag-main"><b>${esc(title(e))}</b>${e.location ? `<span>${I.pin}${esc(e.location)}</span>` : ''}${e.online_url ? `<span>${I.video}Teams meeting</span>` : ''}</span>
          ${e.series_master_id || e.recurrence ? `<span class="ag-ico">${I.repeat}</span>` : ''}${e.sync_state && e.sync_state.startsWith('pending') ? '<i class="pend"></i>' : ''}${e.sync_state === 'error' ? '<i class="errdot"></i>' : ''}
        </button>`).join('') : '<div class="ag-none">No events</div>'}</div>`;
    }
    return `<div class="ag">${out}<button class="ag-more" data-a="more">Show more days</button></div>`;
  }

  // ---------- sheet ----------
  function openSheet(html, mode, id) {
    sheet = { mode, id };
    const el = $('#evSheet');
    el.innerHTML = `<div class="sh-card" role="dialog" aria-modal="true">${html}</div>`;
    el.hidden = false;
    document.body.classList.add('sheet-open');
  }
  function closeSheet() { sheet = null; $('#evSheet').hidden = true; $('#evSheet').innerHTML = ''; document.body.classList.remove('sheet-open'); }
  function choose(question, options) {
    return new Promise(resolve => {
      const el = $('#calChoice');
      el.innerHTML = `<div class="ch-card"><p>${esc(question)}</p>${options.map((o, i) => `<button data-i="${i}" class="${o.danger ? 'danger' : ''}">${esc(o.label)}</button>`).join('')}<button data-i="-1" class="cancel">Cancel</button></div>`;
      el.hidden = false;
      el.onclick = e => {
        const b = e.target.closest('[data-i]'); if (!b && e.target !== el) return;
        const i = b ? +b.dataset.i : -1;
        el.hidden = true; el.innerHTML = '';
        resolve(i >= 0 ? options[i].value : null);
      };
    });
  }

  function renderDetails(id) {
    const e = events.get(id);
    if (!e) { closeSheet(); return; }
    const m = master(e), rec = recText(e.recurrence || (m && m.recurrence));
    const resp = { accepted: 'Accepted', tentativelyAccepted: 'Tentative', declined: 'Declined', notResponded: 'No response yet', none: '' };
    const att = (e.attendees || []);
    const html = `
      <div class="sh-bar"><button class="sh-x" data-a="close" aria-label="Close">${I.close}</button>
        <span></span>${e.is_organizer || !e.outlook_id ? '<button class="sh-btn" data-a="edit">Edit</button>' : '<button class="sh-btn" data-a="edit">Edit</button>'}</div>
      <div class="sh-body">
        <div class="dt-title"><span class="dt-color" style="background:${color(e)}"></span><h2>${esc(title(e))}</h2></div>
        <div class="dt-row">${I.clock}<div>${esc(timeRange(e))}${rec ? `<div class="sub">${I.repeat} ${esc(rec)}</div>` : ''}</div></div>
        ${e.location ? `<div class="dt-row">${I.pin}<div><a href="https://maps.apple.com/?q=${encodeURIComponent(e.location)}" target="_blank" rel="noopener">${esc(e.location)}</a></div></div>` : ''}
        ${e.online_url ? `<a class="dt-join" href="${esc(e.online_url)}" target="_blank" rel="noopener">${I.video} Join Teams meeting</a>` : e.is_online_meeting ? `<div class="dt-row">${I.video}<div>Teams meeting (link appears after sync)</div></div>` : ''}
        ${!e.is_organizer && e.outlook_id ? `<div class="dt-rsvp">
            <div class="sub">${esc((e.organizer && (e.organizer.name || e.organizer.email)) || 'Someone')} invited you${e.response_status && resp[e.response_status] ? ` · ${resp[e.response_status]}` : ''}</div>
            <div class="seg"><button data-rsvp="accept" class="${e.response_status === 'accepted' ? 'on' : ''}">Accept</button><button data-rsvp="tentative" class="${e.response_status === 'tentativelyAccepted' ? 'on' : ''}">Tentative</button><button data-rsvp="decline">Decline</button></div>
          </div>` : ''}
        ${att.length ? `<div class="dt-row">${I.people}<div><div class="sub">${att.length} invited${e.organizer && e.is_organizer === false ? '' : ''}</div>
          ${e.organizer && e.organizer.email ? `<div class="person"><span class="av">${esc(initials(e.organizer))}</span><span>${esc(e.organizer.name || e.organizer.email)}<small>Organizer</small></span></div>` : ''}
          ${att.map(a => `<div class="person"><span class="av">${esc(initials(a))}</span><span>${esc(a.name || a.email)}<small>${esc([a.type === 'optional' ? 'Optional' : '', resp[a.response] || ''].filter(Boolean).join(' · '))}</small></span>${a.response === 'accepted' ? `<i class="ok">${I.check}</i>` : a.response === 'declined' ? '<i class="no">✕</i>' : ''}</div>`).join('')}</div></div>` : ''}
        <div class="dt-row">${I.bell}<div>${esc((REMINDERS.find(r => r[0] === e.reminder_minutes) || [0, e.reminder_minutes == null ? 'No reminder' : e.reminder_minutes + ' minutes before'])[1])}<div class="sub">${esc((SHOWAS.find(s => s[0] === e.show_as) || ['', 'Busy'])[1])}${(e.categories || []).length ? ' · ' + esc(e.categories.join(', ')) : ''}${e.sensitivity === 'private' ? ' · Private' : ''}</div></div></div>
        ${e.notes ? `<div class="dt-row">${I.note}<div class="dt-notes">${linkify(e.notes)}</div></div>` : ''}
        <div class="dt-sync">${syncLine(e)}</div>
        <div class="dt-foot">
          ${e.web_link ? `<a href="${esc(e.web_link)}" target="_blank" rel="noopener">${I.outlook} Open in Outlook</a>` : '<span></span>'}
          <button class="danger" data-a="delete">Delete</button>
        </div>
      </div>`;
    if (sheet && sheet.mode === 'details' && sheet.id === id) $('#evSheet .sh-card').innerHTML = html;
    else openSheet(html, 'details', id);
  }
  function syncLine(e) {
    if (e.sync_state === 'error') return `<span class="err">Couldn't save to Outlook: ${esc(e.sync_error || 'unknown error')}</span> <button data-a="retry">Try again</button>`;
    if ((e.sync_state || '').startsWith('pending')) return status && status.connected ? 'Saving to Outlook…' : 'Saved in the app. Connect Outlook to add it there too.';
    return e.outlook_id ? 'In Outlook' : '';
  }
  const initials = p => ((p.name || p.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('')) || '?';
  function linkify(text) {
    return esc(text).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u.length > 60 ? u.slice(0, 57) + '…' : u}</a>`).replace(/\n/g, '<br>');
  }
  function openEvent(id) {
    if (!loaded) { pendingOpen = id; return; }
    if (events.has(id)) renderDetails(id);
  }

  // ---------- editor ----------
  let draft = null; // { row, scope: 'new'|'single'|'occurrence'|'series', targetId, occStart }
  function newDraft(start, allDay) {
    const s = start || nextSlot(), e = new Date(+s + (allDay ? 86400000 : 30 * 60000));
    return { scope: 'new', row: { subject: '', notes: '', location: '', start_at: s.toISOString(), end_at: e.toISOString(), is_all_day: !!allDay,
      attendees: [], recurrence: null, show_as: allDay ? 'free' : 'busy', categories: [], reminder_minutes: allDay ? 1440 : 15, is_online_meeting: false,
      sensitivity: 'normal', importance: 'normal', is_organizer: true } };
  }
  function nextSlot() { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() < 30 ? 30 : 60); return d; }
  function repeatKind(rec) {
    if (!rec) return 'never';
    const p = rec.pattern || {}, n = p.interval || 1, days = p.daysOfWeek || [];
    if (p.type === 'daily' && n === 1) return 'daily';
    if (p.type === 'weekly' && n === 1 && days.length === 5 && !days.includes('saturday') && !days.includes('sunday')) return 'weekdays';
    if (p.type === 'weekly' && n === 1) return 'weekly';
    if (p.type === 'weekly' && n === 2) return 'biweekly';
    if (p.type === 'absoluteMonthly' && n === 1) return 'monthly';
    if (p.type === 'absoluteYearly') return 'yearly';
    return 'custom';
  }
  function buildRec(kind, start, days, endDate, keep) {
    if (kind === 'never') return null;
    if (kind === 'custom') return keep;
    const range = endDate ? { type: 'endDate', startDate: key(start), endDate } : { type: 'noEnd', startDate: key(start) };
    const dow = DOW[start.getDay()];
    const pat = {
      daily: { type: 'daily', interval: 1 },
      weekdays: { type: 'weekly', interval: 1, daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], firstDayOfWeek: 'sunday' },
      weekly: { type: 'weekly', interval: 1, daysOfWeek: days.length ? days : [dow], firstDayOfWeek: 'sunday' },
      biweekly: { type: 'weekly', interval: 2, daysOfWeek: days.length ? days : [dow], firstDayOfWeek: 'sunday' },
      monthly: { type: 'absoluteMonthly', interval: 1, dayOfMonth: start.getDate() },
      yearly: { type: 'absoluteYearly', interval: 1, dayOfMonth: start.getDate(), month: start.getMonth() + 1 },
    }[kind];
    return { pattern: pat, range };
  }
  function openEditor(d) {
    draft = d;
    const r = d.row, s = new Date(r.start_at), e = new Date(r.end_at);
    const endShown = r.is_all_day ? addDays(e, -1) : e;
    const attendeeOnly = d.scope !== 'new' && r.is_organizer === false;
    const rec = d.scope === 'occurrence' ? null : r.recurrence;
    const kind = repeatKind(rec), days = (rec && rec.pattern && rec.pattern.daysOfWeek) || [DOW[s.getDay()]];
    const dis = attendeeOnly ? 'disabled' : '';
    const html = `
      <form id="evForm" autocomplete="off">
      <div class="sh-bar"><button type="button" class="sh-x" data-a="cancel" aria-label="Cancel">${I.close}</button>
        <span class="sh-t">${d.scope === 'new' ? 'New event' : d.scope === 'series' ? 'Edit series' : 'Edit event'}</span>
        <button type="submit" class="sh-btn primary">Save</button></div>
      <div class="sh-body ed">
        ${attendeeOnly ? `<p class="note">You were invited, so only the organizer can change the details. You can change your reminder, Show as and category.</p>` : ''}
        <input class="ed-title" id="edTitle" placeholder="Add a title" value="${esc(r.subject)}" maxlength="255" ${dis}>
        <div class="ed-card">
          <label class="ed-line"><span>All day</span><input type="checkbox" class="sw" id="edAllDay" ${r.is_all_day ? 'checked' : ''} ${dis}></label>
          <div class="ed-line"><span>Starts</span><div class="ed-dt"><input type="date" id="edSD" value="${toDateInput(s)}" ${dis}><input type="time" id="edST" value="${toTimeInput(s)}" ${r.is_all_day ? 'hidden' : ''} ${dis}></div></div>
          <div class="ed-line"><span>Ends</span><div class="ed-dt"><input type="date" id="edED" value="${toDateInput(endShown)}" ${dis}><input type="time" id="edET" value="${toTimeInput(e)}" ${r.is_all_day ? 'hidden' : ''} ${dis}></div></div>
          ${d.scope === 'occurrence' ? '' : `<label class="ed-line"><span>${I.repeat} Repeat</span><select id="edRep" ${dis}>
            ${[['never', 'Never'], ['daily', 'Every day'], ['weekdays', 'Every weekday'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']].concat(kind === 'custom' ? [['custom', recText(rec) || 'Custom']] : [])
              .map(([v, l]) => `<option value="${v}" ${kind === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <div class="ed-days" id="edDays" ${kind === 'weekly' || kind === 'biweekly' ? '' : 'hidden'}>${DOW.map(dw => `<button type="button" data-dow="${dw}" class="${days.includes(dw) ? 'on' : ''}" ${dis}>${dw[0].toUpperCase()}</button>`).join('')}</div>
          <label class="ed-line" id="edUntilRow" ${kind === 'never' ? 'hidden' : ''}><span>Until</span><input type="date" id="edUntil" value="${esc(rec && rec.range && rec.range.type === 'endDate' ? rec.range.endDate || '' : '')}" ${dis}></label>`}
        </div>
        <div class="ed-card">
          <label class="ed-line"><span>${I.pin}</span><input id="edLoc" placeholder="Add a location" value="${esc(r.location)}" ${dis}></label>
          <label class="ed-line"><span>${I.video} Teams meeting</span><input type="checkbox" class="sw" id="edTeams" ${r.is_online_meeting ? 'checked' : ''} ${dis}></label>
        </div>
        <div class="ed-card">
          <div class="ed-line"><span>${I.people} People</span></div>
          <div id="edPeople" class="ed-people"></div>
          ${attendeeOnly ? '' : `<div class="ed-add"><input id="edEmail" type="email" inputmode="email" placeholder="Invite by email" autocapitalize="off"><button type="button" class="btn" data-a="addp">Add</button></div>`}
        </div>
        <div class="ed-card">
          <label class="ed-line"><span>${I.bell} Reminder</span><select id="edRem">${REMINDERS.map(([v, l]) => `<option value="${v == null ? '' : v}" ${r.reminder_minutes === v || (r.reminder_minutes == null && v == null) ? 'selected' : ''}>${l}</option>`).join('')}${REMINDERS.some(x => x[0] === r.reminder_minutes) ? '' : `<option value="${r.reminder_minutes}" selected>${r.reminder_minutes} minutes before</option>`}</select></label>
          <label class="ed-line"><span>Show as</span><select id="edShow">${SHOWAS.map(([v, l]) => `<option value="${v}" ${r.show_as === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="ed-line"><span>Category</span><select id="edCat"><option value="">None</option>${[...new Set([...Object.keys(CATS), ...(r.categories || [])])].map(c => `<option value="${esc(c)}" ${(r.categories || [])[0] === c ? 'selected' : ''}>${esc(c.replace(' category', ''))}</option>`).join('')}</select></label>
          <label class="ed-line"><span>${I.lock} Private</span><input type="checkbox" class="sw" id="edPriv" ${r.sensitivity === 'private' ? 'checked' : ''} ${dis}></label>
        </div>
        <textarea class="ed-notes" id="edNotes" placeholder="Add notes" ${dis}>${esc(r.notes)}</textarea>
        ${d.scope !== 'new' ? '<button type="button" class="ed-del" data-a="delete">Delete event</button>' : ''}
      </div></form>`;
    openSheet(html, 'edit', d.targetId);
    renderPeople();
    if (d.scope === 'new') setTimeout(() => $('#edTitle').focus(), 50);
  }
  function renderPeople() {
    const list = draft.row.attendees || [], ro = draft.scope !== 'new' && draft.row.is_organizer === false;
    $('#edPeople').innerHTML = list.length ? list.map((a, i) => `<div class="person"><span class="av">${esc(initials(a))}</span><span>${esc(a.name || a.email)}<small>${a.type === 'optional' ? 'Optional' : 'Required'}</small></span>
      ${ro ? '' : `<button type="button" class="mini" data-opt="${i}">${a.type === 'optional' ? 'Make required' : 'Make optional'}</button><button type="button" class="x" data-rm="${i}" aria-label="Remove">${I.close}</button>`}</div>`).join('')
      : '<p class="note">No one invited. Invitees get an Outlook invite from you.</p>';
  }
  function readForm() {
    const r = { ...draft.row };
    const allDay = $('#edAllDay').checked;
    let s, e;
    if (allDay) { s = fromKey($('#edSD').value); e = addDays(fromKey($('#edED').value || $('#edSD').value), 1); }
    else { s = combine($('#edSD').value, $('#edST').value); e = combine($('#edED').value || $('#edSD').value, $('#edET').value); }
    if (e < s) e = new Date(+s + 30 * 60000);
    r.subject = $('#edTitle').value.trim();
    r.is_all_day = allDay; r.start_at = s.toISOString(); r.end_at = e.toISOString();
    r.location = $('#edLoc').value.trim();
    r.is_online_meeting = $('#edTeams').checked;
    const rem = $('#edRem').value; r.reminder_minutes = rem === '' ? null : Number(rem);
    r.show_as = $('#edShow').value;
    r.categories = $('#edCat').value ? [$('#edCat').value] : [];
    r.sensitivity = $('#edPriv').checked ? 'private' : 'normal';
    r.notes = $('#edNotes').value;
    if ($('#edRep')) {
      const kind = $('#edRep').value;
      const days = [...document.querySelectorAll('#edDays button.on')].map(b => b.dataset.dow);
      r.recurrence = buildRec(kind, s, days, $('#edUntil') ? $('#edUntil').value : '', draft.row.recurrence);
    }
    return r;
  }
  const EDIT_FIELDS = ['subject', 'notes', 'location', 'start_at', 'end_at', 'is_all_day', 'attendees', 'recurrence', 'show_as', 'categories', 'reminder_minutes', 'is_online_meeting', 'sensitivity', 'importance'];
  async function saveDraft() {
    const r = readForm();
    const fields = Object.fromEntries(EDIT_FIELDS.map(k => [k, r[k]]));
    if (!fields.subject && draft.scope === 'new') fields.subject = '(No title)';
    if (draft.scope === 'occurrence') delete fields.recurrence;
    if (draft.scope === 'series') {
      // Move the whole series by the change made to this occurrence's time.
      const m = events.get(draft.targetId), occ = draft.occ;
      const dS = new Date(r.start_at) - new Date(occ.start_at), dE = new Date(r.end_at) - new Date(occ.end_at);
      fields.start_at = new Date(+new Date(m.start_at) + dS).toISOString();
      fields.end_at = new Date(+new Date(m.end_at) + dE).toISOString();
    }
    closeSheet();
    let res;
    if (draft.scope === 'new') res = await sb.from('calendar_events').insert(fields).select().single();
    else res = await sb.from('calendar_events').update(fields).eq('id', draft.targetId).select().single();
    if (res.error) { flash('Could not save the event'); console.error(res.error); return; }
    events.set(res.data.id, res.data);
    renderBody();
    flash(status && status.connected ? 'Saved. Sending to Outlook…' : 'Saved');
  }
  async function deleteEvent(e) {
    let target = e;
    if (e.series_master_id) {
      const m = master(e);
      const pick = await choose('Delete this event or the whole series?', [
        { label: 'Delete this event', value: 'one', danger: true },
        ...(m ? [{ label: 'Delete all events in the series', value: 'all', danger: true }] : []),
      ]);
      if (!pick) return;
      if (pick === 'all') target = m;
    } else {
      const ok = await choose(e.is_organizer && (e.attendees || []).length ? 'Delete this event? Invitees will get a cancellation from Outlook.' : 'Delete this event?', [{ label: 'Delete', value: true, danger: true }]);
      if (!ok) return;
    }
    closeSheet();
    const { error } = await sb.from('calendar_events').delete().eq('id', target.id);
    if (error) { flash('Could not delete'); return; }
    if (target.outlook_id) { const x = events.get(target.id); if (x) events.set(x.id, { ...x, sync_state: 'pending_delete' }); }
    else events.delete(target.id);
    renderBody();
    flash('Deleted');
  }
  async function editEvent(e) {
    if (e.series_master_id && e.is_organizer !== false) {
      const m = master(e);
      if (m) {
        const pick = await choose('Edit this event or the whole series?', [{ label: 'Edit this event', value: 'one' }, { label: 'Edit the series', value: 'all' }]);
        if (!pick) return;
        if (pick === 'all') { openEditor({ scope: 'series', targetId: m.id, occ: e, row: { ...m, start_at: e.start_at, end_at: e.end_at } }); return; }
      }
      openEditor({ scope: 'occurrence', targetId: e.id, row: { ...e } });
      return;
    }
    openEditor({ scope: 'single', targetId: e.id, row: { ...e } });
  }

  // ---------- Outlook sheet ----------
  function renderOutlookSheet() {
    const s = status || {};
    const html = `<div class="sh-bar"><button class="sh-x" data-a="close" aria-label="Close">${I.close}</button><span class="sh-t">Outlook</span><span></span></div>
      <div class="sh-body">
        ${s.connected ? `
          <div class="dt-row">${I.outlook}<div><b>${esc(s.email || 'Connected')}</b><div class="sub">${s.last_sync_at ? 'Last synced ' + esc(new Date(s.last_sync_at).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })) : 'Syncing for the first time…'}</div></div></div>
          ${s.last_error ? `<p class="err">${esc(s.last_error)}</p>` : '<p class="note">Changes sync both ways about every minute. Invites go out from your Outlook.</p>'}
          <div class="ol-btns"><button class="btn" data-a="syncnow">${I.sync} Sync now</button>${s.last_error ? '<button class="btn" data-a="connect">Sign in again</button>' : ''}</div>
          <button class="ed-del" data-a="disconnect">Disconnect Outlook</button>`
        : `<p>Connect your work Outlook calendar. Your Outlook events show up here, and events you add here (or ask Claude to add) go to Outlook, with invites sent from your account.</p>
          <button class="btn" data-a="connect">Connect Outlook</button>
          <p class="note">You'll sign in with Microsoft. If your organization blocks it, ask IT to allow the "Aboud's Tasks" app.</p>`}
      </div>`;
    if (sheet && sheet.mode === 'outlook') $('#evSheet .sh-card').innerHTML = html; else openSheet(html, 'outlook');
  }

  // ---------- events (DOM) ----------
  $('#calViews').addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    view = b.dataset.view; localStorage.setItem('calView', view); didScroll = false;
    if (view === 'agenda') agendaDays = 45;
    render();
  });
  $('#calPrev').addEventListener('click', () => move(-1));
  $('#calNext').addEventListener('click', () => move(1));
  $('#calToday').addEventListener('click', () => { cursor = startOfDay(new Date()); didScroll = false; render(); });
  $('#calNew').addEventListener('click', () => {
    const d = newDraft(view !== 'agenda' && !sameDay(cursor, new Date()) ? combine(key(cursor), '09:00') : null);
    openEditor(d);
  });
  $('#calOutlook').addEventListener('click', () => { renderOutlookSheet(); loadStatus(); });
  $('#calBody').addEventListener('click', e => {
    const ev = e.target.closest('[data-ev]');
    if (ev) { openEvent(ev.dataset.ev); return; }
    if (e.target.closest('[data-a="more"]')) { agendaDays += 45; renderBody(); return; }
    const go = e.target.closest('[data-goday]');
    if (go) { cursor = fromKey(go.dataset.goday); view = view === 'agenda' ? 'agenda' : 'day'; didScroll = false; localStorage.setItem('calView', view); render(); return; }
    const col = e.target.closest('.tg-col');
    if (col) {
      const rect = col.getBoundingClientRect();
      const mins = Math.max(0, Math.min(23.5 * 60, Math.floor(((e.clientY - rect.top) / HOUR * 60) / 30) * 30));
      const s = fromKey(col.dataset.day); s.setMinutes(mins);
      openEditor(newDraft(s));
      return;
    }
    const ad = e.target.closest('.tg-ad');
    if (ad) openEditor(newDraft(fromKey(ad.dataset.day), true));
  });
  // Swipe left/right to change days.
  let tx = null;
  $('#calBody').addEventListener('touchstart', e => { const t = e.touches[0]; tx = { x: t.clientX, y: t.clientY, at: Date.now() }; }, { passive: true });
  $('#calBody').addEventListener('touchend', e => {
    if (!tx) return; const t = e.changedTouches[0], dx = t.clientX - tx.x, dy = t.clientY - tx.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - tx.at < 600 && view !== 'agenda') move(dx < 0 ? 1 : -1);
    tx = null;
  });

  $('#evSheet').addEventListener('click', async e => {
    if (e.target.id === 'evSheet') { closeSheet(); return; }
    const a = e.target.closest('[data-a]'), id = sheet && sheet.id, ev = id && events.get(id);
    const rsvp = e.target.closest('[data-rsvp]');
    if (rsvp && ev) {
      const kind = rsvp.dataset.rsvp;
      let series = false;
      if (ev.series_master_id) series = await choose('Respond to this event or the whole series?', [{ label: 'This event', value: false }, { label: 'The whole series', value: true }]);
      if (series === null) return;
      rsvp.disabled = true;
      try { await callSync({ action: 'respond', id: ev.id, response: kind, series }); flash(kind === 'decline' ? 'Declined' : 'Response sent'); if (kind === 'decline') closeSheet(); }
      catch (err) { flash(err.message); rsvp.disabled = false; }
      return;
    }
    if (sheet && sheet.mode === 'edit') {
      const opt = e.target.closest('[data-opt]'), rm = e.target.closest('[data-rm]'), dw = e.target.closest('[data-dow]');
      if (opt) { const p = draft.row.attendees[+opt.dataset.opt]; p.type = p.type === 'optional' ? 'required' : 'optional'; renderPeople(); return; }
      if (rm) { draft.row.attendees.splice(+rm.dataset.rm, 1); renderPeople(); return; }
      if (dw) { dw.classList.toggle('on'); if (!document.querySelector('#edDays button.on')) dw.classList.add('on'); return; }
    }
    if (!a) return;
    switch (a.dataset.a) {
      case 'close': case 'cancel': closeSheet(); break;
      case 'edit': if (ev) editEvent(ev); break;
      case 'delete': {
        const target = sheet.mode === 'edit' && draft.scope === 'series' ? draft.occ : ev;
        if (target) deleteEvent(target);
        break;
      }
      case 'retry': if (ev) { await sb.from('calendar_events').update({ sync_state: 'pending_retry' }).eq('id', ev.id); flash('Trying again…'); } break;
      case 'addp': addPerson(); break;
      case 'connect': {
        a.disabled = true;
        try { const r = await callSync({ action: 'connect', tz: Intl.DateTimeFormat().resolvedOptions().timeZone }); location.href = r.url; }
        catch (err) { info(err.message); a.disabled = false; }
        break;
      }
      case 'syncnow': {
        a.disabled = true;
        try { const r = await callSync({ action: 'sync' }); flash(r && r.error ? r.error : 'Synced'); await loadStatus(); await load(); }
        catch (err) { flash(err.message); }
        a.disabled = false;
        break;
      }
      case 'disconnect': {
        const ok = await choose('Disconnect Outlook? Outlook events are removed from this app (they stay in Outlook).', [{ label: 'Disconnect', value: true, danger: true }]);
        if (!ok) break;
        try { await callSync({ action: 'disconnect' }); await loadStatus(); await load(); flash('Disconnected'); } catch (err) { flash(err.message); }
        break;
      }
    }
  });
  function addPerson() {
    const inp = $('#edEmail'), v = inp.value.trim();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { flash("That email doesn't look right"); return; }
    if ((draft.row.attendees || []).some(a => a.email.toLowerCase() === v.toLowerCase())) { inp.value = ''; return; }
    draft.row.attendees = [...(draft.row.attendees || []), { email: v, name: '', type: 'required', response: 'none' }];
    inp.value = ''; renderPeople(); inp.focus();
  }
  $('#evSheet').addEventListener('keydown', e => {
    if (e.target.id === 'edEmail' && e.key === 'Enter') { e.preventDefault(); addPerson(); }
  });
  $('#evSheet').addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'evForm') saveDraft(); });
  $('#evSheet').addEventListener('change', e => {
    if (!sheet || sheet.mode !== 'edit') return;
    const t = e.target;
    if (t.id === 'edAllDay') {
      $('#edST').hidden = $('#edET').hidden = t.checked;
      if (t.checked && $('#edShow').value === 'busy') $('#edShow').value = 'free';
    }
    if (t.id === 'edSD' || t.id === 'edST') {
      // Keep the length the same when the start moves (like Outlook).
      const r = draft.row, len = new Date(r.end_at) - new Date(r.start_at);
      const s = $('#edAllDay').checked ? fromKey($('#edSD').value) : combine($('#edSD').value, $('#edST').value);
      if (!isNaN(s)) {
        const en = new Date(+s + len);
        $('#edED').value = toDateInput($('#edAllDay').checked ? addDays(en, -1) : en); $('#edET').value = toTimeInput(en);
        draft.row = { ...r, start_at: s.toISOString(), end_at: en.toISOString() };
      }
    }
    if (t.id === 'edRep') {
      $('#edDays').hidden = !['weekly', 'biweekly'].includes(t.value);
      $('#edUntilRow').hidden = t.value === 'never';
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet && !$('#calChoice').innerHTML) closeSheet(); });
  setInterval(() => { if (visible && view !== 'month' && view !== 'agenda' && !sheet) renderBody(); }, 60000);
  setInterval(() => { if (visible) loadStatus(); }, 60000);

  return {
    show() { visible = true; render(); if (!loaded) load(); loadStatus(); },
    hide() { visible = false; },
    start() { loaded = false; events = new Map(); load(); subscribe(); loadStatus(); },
    stop() { if (channel) sb.removeChannel(channel); channel = null; events = new Map(); loaded = false; closeSheet(); },
    openEvent,
    refresh() { if (getUser()) { load(); loadStatus(); } },
  };
}

// Two-way sync between public.calendar_events and the Outlook (Microsoft 365) calendar.
//
//   POST {action:"sync"}                 cron (x-cron-secret) for everyone, or the signed-in user for themselves
//   POST {action:"connect", tz}          signed-in user -> returns the Microsoft sign-in URL
//   GET  /outlook-sync/callback          Microsoft redirects here after sign-in
//   POST {action:"respond", id, response, comment}   accept / tentativelyAccept / decline an invite
//   POST {action:"disconnect"}           forget the Outlook connection and the synced copies
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET") ?? "";
const SCOPES = "offline_access User.Read Calendars.ReadWrite";
const GRAPH = "https://graph.microsoft.com/v1.0";
const PAST_DAYS = 90, FUTURE_DAYS = 400;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Cfg = { ms_client_id: string; ms_tenant_id: string; cron_secret: string; app_url: string; outlook_redirect_uri: string };
let cfg: Cfg | null = null;
async function config(): Promise<Cfg> {
  if (cfg) return cfg;
  const { data, error } = await sb.rpc("get_outlook_config");
  if (error) throw error;
  cfg = data as Cfg;
  return cfg;
}

// ---------- time zones ----------
const WIN: Record<string, string> = {
  "America/Toronto": "Eastern Standard Time", "America/New_York": "Eastern Standard Time", "America/Detroit": "Eastern Standard Time",
  "America/Montreal": "Eastern Standard Time", "America/Nassau": "Eastern Standard Time", "America/Indiana/Indianapolis": "US Eastern Standard Time",
  "America/Chicago": "Central Standard Time", "America/Winnipeg": "Central Standard Time", "America/Mexico_City": "Central Standard Time (Mexico)",
  "America/Regina": "Canada Central Standard Time", "America/Denver": "Mountain Standard Time", "America/Edmonton": "Mountain Standard Time",
  "America/Phoenix": "US Mountain Standard Time", "America/Los_Angeles": "Pacific Standard Time", "America/Vancouver": "Pacific Standard Time",
  "America/Halifax": "Atlantic Standard Time", "America/St_Johns": "Newfoundland Standard Time", "America/Anchorage": "Alaskan Standard Time",
  "Pacific/Honolulu": "Hawaiian Standard Time", "Europe/London": "GMT Standard Time", "Europe/Dublin": "GMT Standard Time",
  "Europe/Paris": "Romance Standard Time", "Europe/Brussels": "Romance Standard Time", "Europe/Madrid": "Romance Standard Time",
  "Europe/Berlin": "W. Europe Standard Time", "Europe/Amsterdam": "W. Europe Standard Time", "Europe/Rome": "W. Europe Standard Time",
  "Europe/Zurich": "W. Europe Standard Time", "Europe/Stockholm": "W. Europe Standard Time", "Europe/Athens": "GTB Standard Time",
  "Europe/Istanbul": "Turkey Standard Time", "Europe/Moscow": "Russian Standard Time", "Asia/Kuwait": "Arab Standard Time",
  "Asia/Riyadh": "Arab Standard Time", "Asia/Qatar": "Arab Standard Time", "Asia/Bahrain": "Arab Standard Time",
  "Asia/Baghdad": "Arabic Standard Time", "Asia/Dubai": "Arabian Standard Time", "Asia/Muscat": "Arabian Standard Time",
  "Asia/Tehran": "Iran Standard Time", "Asia/Beirut": "Middle East Standard Time", "Asia/Amman": "Jordan Standard Time",
  "Africa/Cairo": "Egypt Standard Time", "Asia/Karachi": "Pakistan Standard Time", "Asia/Kolkata": "India Standard Time",
  "Asia/Singapore": "Singapore Standard Time", "Asia/Shanghai": "China Standard Time", "Asia/Hong_Kong": "China Standard Time",
  "Asia/Tokyo": "Tokyo Standard Time", "Asia/Seoul": "Korea Standard Time", "Australia/Sydney": "AUS Eastern Standard Time",
  "Australia/Melbourne": "AUS Eastern Standard Time", "Pacific/Auckland": "New Zealand Standard Time", "UTC": "UTC", "Etc/UTC": "UTC",
};
const zones = (tz: string) => (WIN[tz] ? { iana: tz, win: WIN[tz] } : { iana: "UTC", win: "UTC" });

function wallParts(d: Date, iana: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: iana, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => Number(f.find((p) => p.type === t)!.value);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute"), s: g("second") };
}
function offsetMs(iana: string, t: number) {
  const p = wallParts(new Date(t), iana);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}
// "2026-11-20T15:30:00.0000000" in iana -> UTC Date
function wallToUtc(wall: string, iana: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(wall)!;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const o1 = offsetMs(iana, guess);
  let t = guess - o1;
  const o2 = offsetMs(iana, t);
  if (o2 !== o1) t = guess - o2;
  return new Date(t);
}
const p2 = (n: number) => String(n).padStart(2, "0");
function utcToWall(d: Date, iana: string) {
  const p = wallParts(d, iana);
  return `${p.y}-${p2(p.mo)}-${p2(p.d)}T${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}`;
}

// ---------- mapping ----------
function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const EDITABLE = ["subject", "notes", "location", "start_at", "end_at", "is_all_day", "attendees", "recurrence", "show_as",
  "categories", "reminder_minutes", "is_online_meeting", "sensitivity", "importance"];
// deno-lint-ignore no-explicit-any
function canon(v: any): any {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") return Object.keys(v).sort().reduce((o, k) => (v[k] == null ? o : ((o as Row)[k] = canon(v[k]), o)), {});
  return v;
}
function norm(key: string, v: unknown) {
  if (key === "start_at" || key === "end_at") return v ? new Date(v as string).toISOString() : null;
  if (key === "attendees") return ((v as Row[]) ?? []).map((a) => `${String(a.email || "").toLowerCase()}|${a.type || "required"}`).sort().join(",");
  if (key === "recurrence") return v ? JSON.stringify(canon({ pattern: (v as Row).pattern, range: { ...(v as Row).range, recurrenceTimeZone: undefined } })) : null;
  if (key === "categories") return JSON.stringify(v ?? []);
  if (key === "notes") return String(v ?? "").trim();
  return v ?? null;
}
const snapshot = (r: Row) => Object.fromEntries(EDITABLE.map((k) => [k, r[k] ?? null]));
function changedKeys(r: Row) {
  const remote = r.remote || {};
  return EDITABLE.filter((k) => JSON.stringify(norm(k, r[k])) !== JSON.stringify(norm(k, remote[k])));
}

function fromGraph(ev: Row, iana: string): Row {
  const allDay = !!ev.isAllDay;
  const start = wallToUtc(ev.start.dateTime, iana);
  const end = wallToUtc(ev.end.dateTime, iana);
  const notes = ev.body ? (ev.body.contentType === "html" ? htmlToText(ev.body.content || "") : String(ev.body.content || "")) : (ev.bodyPreview || "");
  const row: Row = {
    outlook_id: ev.id, ical_uid: ev.iCalUId ?? null, change_key: ev.changeKey ?? null,
    subject: ev.subject ?? "", notes: notes.slice(0, 20000), location: ev.location?.displayName ?? "",
    start_at: start.toISOString(), end_at: (end < start ? start : end).toISOString(), is_all_day: allDay,
    attendees: (ev.attendees ?? []).map((a: Row) => ({
      email: a.emailAddress?.address ?? "", name: a.emailAddress?.name ?? "", type: a.type ?? "required", response: a.status?.response ?? "none",
    })),
    organizer: ev.organizer ? { email: ev.organizer.emailAddress?.address ?? "", name: ev.organizer.emailAddress?.name ?? "" } : null,
    is_organizer: ev.isOrganizer !== false, response_status: ev.responseStatus?.response ?? null,
    recurrence: ev.recurrence ?? null, series_master_id: ev.seriesMasterId ?? null, event_type: ev.type ?? "singleInstance",
    show_as: ev.showAs ?? "busy", categories: ev.categories ?? [],
    reminder_minutes: ev.isReminderOn ? (ev.reminderMinutesBeforeStart ?? 15) : null,
    is_online_meeting: !!ev.isOnlineMeeting, online_url: ev.onlineMeeting?.joinUrl ?? ev.onlineMeetingUrl ?? null,
    web_link: ev.webLink ?? null, is_cancelled: !!ev.isCancelled,
    sensitivity: ev.sensitivity ?? "normal", importance: ev.importance ?? "normal",
    sync_state: "synced", sync_error: null, sync_attempts: 0, touched_by: "sync",
  };
  row.remote = snapshot(row);
  return row;
}

function toGraph(r: Row, keys: string[] | null, z: { iana: string; win: string }) {
  const all = !keys, has = (k: string) => all || keys!.includes(k);
  const b: Row = {};
  if (has("subject")) b.subject = r.subject || "";
  if (has("notes")) b.body = { contentType: "text", content: r.notes || "" };
  if (has("location")) b.location = { displayName: r.location || "" };
  if (has("start_at") || has("end_at") || has("is_all_day")) {
    const s = new Date(r.start_at), e = new Date(r.end_at);
    if (r.is_all_day) {
      const sd = utcToWall(s, z.iana).slice(0, 10);
      let ed = utcToWall(e, z.iana).slice(0, 10);
      if (ed <= sd) { const t = new Date(sd + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + 1); ed = t.toISOString().slice(0, 10); }
      b.start = { dateTime: sd + "T00:00:00", timeZone: z.win };
      b.end = { dateTime: ed + "T00:00:00", timeZone: z.win };
    } else {
      b.start = { dateTime: utcToWall(s, z.iana), timeZone: z.win };
      b.end = { dateTime: utcToWall(e, z.iana), timeZone: z.win };
    }
    b.isAllDay = !!r.is_all_day;
  }
  if (has("attendees")) {
    b.attendees = ((r.attendees as Row[]) ?? []).filter((a) => a.email).map((a) => ({
      emailAddress: { address: a.email, name: a.name || a.email }, type: a.type === "optional" ? "optional" : "required",
    }));
  }
  if (has("recurrence")) {
    if (r.recurrence) {
      const rec = JSON.parse(JSON.stringify(r.recurrence));
      rec.range = rec.range || { type: "noEnd" };
      rec.range.startDate = utcToWall(new Date(r.start_at), z.iana).slice(0, 10);
      rec.range.recurrenceTimeZone = z.win;
      if (rec.range.type === "endDate" && !rec.range.endDate) rec.range.type = "noEnd";
      b.recurrence = rec;
    } else if (!all) b.recurrence = null;
  }
  if (has("show_as")) b.showAs = r.show_as || "busy";
  if (has("categories")) b.categories = r.categories ?? [];
  if (has("reminder_minutes")) {
    b.isReminderOn = r.reminder_minutes != null;
    if (r.reminder_minutes != null) b.reminderMinutesBeforeStart = r.reminder_minutes;
  }
  if (has("is_online_meeting") && (r.is_online_meeting || !all)) {
    b.isOnlineMeeting = !!r.is_online_meeting;
    if (r.is_online_meeting) b.onlineMeetingProvider = "teamsForBusiness";
  }
  if (has("sensitivity")) b.sensitivity = r.sensitivity || "normal";
  if (has("importance")) b.importance = r.importance || "normal";
  return b;
}

// ---------- Microsoft auth + Graph ----------
async function tokenRequest(params: Record<string, string>) {
  const c = await config();
  const res = await fetch(`https://login.microsoftonline.com/${c.ms_tenant_id}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.ms_client_id, client_secret: CLIENT_SECRET, scope: SCOPES, ...params }),
  });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error_description || body.error || "token error"), { code: body.error });
  return body;
}
async function accessToken(acc: Row) {
  if (acc.access_token && acc.access_expires_at && new Date(acc.access_expires_at).getTime() > Date.now() + 120000) return acc.access_token;
  let t;
  try {
    t = await tokenRequest({ grant_type: "refresh_token", refresh_token: acc.refresh_token });
  } catch (err) {
    if ((err as Row).code === "invalid_grant") {
      await sb.from("outlook_accounts").update({ last_error: "Outlook sign-in expired. Tap Connect Outlook to sign in again." }).eq("user_id", acc.user_id);
    }
    throw err;
  }
  acc.access_token = t.access_token;
  acc.access_expires_at = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString();
  if (t.refresh_token) acc.refresh_token = t.refresh_token;
  await sb.from("outlook_accounts").update({
    access_token: acc.access_token, access_expires_at: acc.access_expires_at, refresh_token: acc.refresh_token,
  }).eq("user_id", acc.user_id);
  return acc.access_token;
}
async function graph(acc: Row, method: string, path: string, body?: unknown, prefer: string[] = []) {
  const z = zones(acc.tz);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(path.startsWith("http") ? path : GRAPH + path, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken(acc)}`,
        "Content-Type": "application/json",
        Prefer: [`outlook.timezone="${z.win}"`, 'outlook.body-content-type="text"', ...prefer].join(", "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      await new Promise((r) => setTimeout(r, Math.min(10, Number(res.headers.get("Retry-After") || 2)) * 1000));
      continue;
    }
    const text = await res.text();
    let data: Row | null = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { status: res.status, ok: res.ok, data };
  }
  return { status: 429, ok: false, data: null };
}
const gErr = (r: { status: number; data: Row | null }) => r.data?.error?.message || `Outlook error ${r.status}`;

// ---------- sync ----------
async function removeLocal(ids: string[]) {
  if (!ids.length) return;
  await sb.from("calendar_events").update({ sync_state: "deleted_remote", touched_by: "sync" }).in("id", ids);
  await sb.from("calendar_events").delete().in("id", ids);
}

async function pushPending(acc: Row) {
  const z = zones(acc.tz);
  const { data: rows } = await sb.from("calendar_events").select("*")
    .eq("user_id", acc.user_id).in("sync_state", ["pending_create", "pending_update", "pending_delete"])
    .order("updated_at").limit(40);
  let pushed = 0;
  for (const r of rows ?? []) {
    try {
      if (r.sync_state === "pending_delete") {
        if (r.outlook_id) {
          const res = await graph(acc, "DELETE", `/me/events/${encodeURIComponent(r.outlook_id)}`);
          if (!res.ok && res.status !== 404) throw new Error(gErr(res));
        }
        const ids = [r.id];
        if (r.event_type === "seriesMaster" && r.outlook_id) {
          const { data: occ } = await sb.from("calendar_events").select("id").eq("user_id", acc.user_id).eq("series_master_id", r.outlook_id);
          ids.push(...(occ ?? []).map((o: Row) => o.id));
        }
        await removeLocal(ids);
      } else if (r.sync_state === "pending_create" || !r.outlook_id) {
        const res = await graph(acc, "POST", "/me/events", toGraph(r, null, z));
        if (!res.ok) throw new Error(gErr(res));
        await sb.from("calendar_events").update(fromGraph(res.data!, z.iana)).eq("id", r.id);
      } else {
        const keys = changedKeys(r);
        if (!keys.length) {
          await sb.from("calendar_events").update({ sync_state: "synced", sync_error: null, touched_by: "sync" }).eq("id", r.id);
        } else {
          const res = await graph(acc, "PATCH", `/me/events/${encodeURIComponent(r.outlook_id)}`, toGraph(r, keys, z));
          if (res.status === 404) await removeLocal([r.id]);
          else if (!res.ok) throw new Error(gErr(res));
          else await sb.from("calendar_events").update(fromGraph(res.data!, z.iana)).eq("id", r.id);
        }
      }
      pushed++;
    } catch (err) {
      const attempts = (r.sync_attempts ?? 0) + 1;
      await sb.from("calendar_events").update({
        sync_attempts: attempts, sync_error: String((err as Error).message).slice(0, 300), touched_by: "sync",
        sync_state: attempts >= 3 ? "error" : r.sync_state,
      }).eq("id", r.id);
    }
  }
  return pushed;
}

async function upsertRemote(acc: Row, events: Row[]) {
  if (!events.length) return;
  const z = zones(acc.tz);
  const ids = events.map((e) => e.id);
  const { data: existing } = await sb.from("calendar_events").select("outlook_id,sync_state")
    .eq("user_id", acc.user_id).in("outlook_id", ids);
  const pending = new Set((existing ?? []).filter((e: Row) => e.sync_state !== "synced" && e.sync_state !== "error").map((e: Row) => e.outlook_id));
  const rows = events.filter((e) => !pending.has(e.id) && e.start && e.end).map((e) => ({ ...fromGraph(e, z.iana), user_id: acc.user_id }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from("calendar_events").upsert(rows.slice(i, i + 100), { onConflict: "user_id,outlook_id" });
    if (error) throw error;
  }
}

async function pullChanges(acc: Row) {
  const now = Date.now();
  let full = !acc.delta_link || !acc.window_start || new Date(acc.window_start).getTime() < now - (PAST_DAYS + 14) * 86400000;
  let url: string;
  let winStart = acc.window_start, winEnd = acc.window_end;
  const begin = () => {
    winStart = new Date(now - PAST_DAYS * 86400000).toISOString();
    winEnd = new Date(now + FUTURE_DAYS * 86400000).toISOString();
    return `${GRAPH}/me/calendarView/delta?startDateTime=${winStart}&endDateTime=${winEnd}`;
  };
  url = full ? begin() : acc.delta_link;
  const seen = new Set<string>();
  const masters = new Set<string>();
  let removed = 0, changed = 0, deltaLink = "";
  for (let page = 0; page < 200; page++) {
    const res = await graph(acc, "GET", url, undefined, ["odata.maxpagesize=100"]);
    if (res.status === 410 && !full) { full = true; url = begin(); continue; }
    if (!res.ok) throw new Error(gErr(res));
    const items: Row[] = res.data!.value ?? [];
    const gone = items.filter((i) => i["@removed"]).map((i) => i.id);
    const live = items.filter((i) => !i["@removed"]);
    live.forEach((i) => { seen.add(i.id); if (i.seriesMasterId) masters.add(i.seriesMasterId); });
    if (gone.length) {
      const { data: loc } = await sb.from("calendar_events").select("id").eq("user_id", acc.user_id).eq("sync_state", "synced").in("outlook_id", gone);
      await removeLocal((loc ?? []).map((r: Row) => r.id));
      removed += gone.length;
    }
    await upsertRemote(acc, live);
    changed += live.length;
    if (res.data!["@odata.nextLink"]) { url = res.data!["@odata.nextLink"]; continue; }
    deltaLink = res.data!["@odata.deltaLink"] ?? "";
    break;
  }
  if (full) {
    // Anything we hold in the window that Outlook no longer has goes away.
    const { data: mine } = await sb.from("calendar_events").select("id,outlook_id")
      .eq("user_id", acc.user_id).eq("sync_state", "synced").neq("event_type", "seriesMaster")
      .gte("start_at", winStart).lte("start_at", winEnd);
    await removeLocal((mine ?? []).filter((r: Row) => r.outlook_id && !seen.has(r.outlook_id)).map((r: Row) => r.id));
  }
  // Series masters: needed to show and edit "every week" rules. Fetch new or changed ones.
  const { data: known } = await sb.from("calendar_events").select("outlook_id").eq("user_id", acc.user_id).eq("event_type", "seriesMaster");
  const have = new Set((known ?? []).map((r: Row) => r.outlook_id));
  const { data: occ } = await sb.from("calendar_events").select("series_master_id").eq("user_id", acc.user_id).not("series_master_id", "is", null);
  (occ ?? []).forEach((r: Row) => { if (!have.has(r.series_master_id)) masters.add(r.series_master_id); });
  const fetched: Row[] = [];
  for (const id of [...masters].slice(0, 25)) {
    const res = await graph(acc, "GET", `/me/events/${encodeURIComponent(id)}`);
    if (res.ok) fetched.push(res.data!);
  }
  await upsertRemote(acc, fetched);
  await sb.from("outlook_accounts").update({
    delta_link: deltaLink || acc.delta_link, window_start: winStart, window_end: winEnd,
    last_sync_at: new Date().toISOString(), last_error: null,
  }).eq("user_id", acc.user_id);
  return { changed, removed, masters: fetched.length };
}

async function syncUser(userId: string) {
  const { data: locked } = await sb.rpc("outlook_try_lock", { uid: userId });
  if (!locked) return { skipped: "busy" };
  let result: Row = {};
  try {
    for (let round = 0; round < 3; round++) {
      const { data: acc } = await sb.from("outlook_accounts").select("*").eq("user_id", userId).maybeSingle();
      if (!acc || !acc.refresh_token) return { skipped: "not connected" };
      try {
        const pushed = await pushPending(acc);
        const pulled = await pullChanges(acc);
        result = { pushed, ...pulled };
      } catch (err) {
        const msg = String((err as Error).message).slice(0, 300);
        if (!/expired/i.test(msg)) await sb.from("outlook_accounts").update({ last_error: msg }).eq("user_id", userId);
        result = { error: msg };
        break;
      }
      const { data: again } = await sb.rpc("outlook_unlock", { uid: userId });
      if (!again) return result;
      const { data: relock } = await sb.rpc("outlook_try_lock", { uid: userId });
      if (!relock) return result;
    }
  } finally {
    await sb.rpc("outlook_unlock", { uid: userId });
  }
  return result;
}

async function userFrom(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await sb.auth.getUser(token);
  return data.user ?? null;
}

function page(title: string, message: string, appUrl: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;background:#faf9f8;color:#252423;display:grid;place-items:center;min-height:90vh;margin:0;padding:24px}
.c{background:#fff;border-radius:8px;box-shadow:0 1.6px 3.6px rgba(0,0,0,.13);padding:28px;max-width:380px;text-align:center}
h1{color:#2564cf;font-size:22px;margin:0 0 8px}p{color:#605e5c;line-height:1.45}a{display:inline-block;margin-top:12px;background:#2564cf;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;font-weight:600}</style></head>
<body><div class="c"><h1>${title}</h1><p>${message}</p><a href="${appUrl}">Back to Aboud's Tasks</a></div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    const c = await config();

    if (req.method === "GET" && url.pathname.endsWith("/callback")) {
      const appUrl = c.app_url || "/";
      const err = url.searchParams.get("error_description") || url.searchParams.get("error");
      if (err) return page("Couldn't connect Outlook", err.replace(/[<>]/g, ""), appUrl);
      const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
      const { data: st } = await sb.from("oauth_states").select("*").eq("state", state).maybeSingle();
      if (!st || Date.now() - new Date(st.created_at).getTime() > 20 * 60000) return page("Link expired", "Go back to the app and tap Connect Outlook again.", appUrl);
      await sb.from("oauth_states").delete().eq("state", state);
      const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: c.outlook_redirect_uri });
      const me = await (await fetch(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
      await sb.from("outlook_accounts").upsert({
        user_id: st.user_id, email: me.mail || me.userPrincipalName || "", display_name: me.displayName || "",
        refresh_token: t.refresh_token, access_token: t.access_token,
        access_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
        tz: st.tz || "America/Toronto", delta_link: null, window_start: null, window_end: null, last_error: null, lock_until: null,
      });
      // @ts-ignore EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(syncUser(st.user_id));
      return page("Outlook connected", "Your calendar is syncing now. It can take a minute the first time.", appUrl);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const fromCron = !!c.cron_secret && req.headers.get("x-cron-secret") === c.cron_secret;

    if (fromCron && body.action === "sync") {
      if (body.user_id) return json(await syncUser(body.user_id));
      const { data: accs } = await sb.from("outlook_accounts").select("user_id").not("refresh_token", "is", null);
      const out: Row = {};
      for (const a of accs ?? []) out[a.user_id] = await syncUser(a.user_id);
      return json(out);
    }

    const user = await userFrom(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    if (body.action === "connect") {
      if (!c.ms_client_id || !c.ms_tenant_id || !CLIENT_SECRET) return json({ error: "Outlook isn't set up yet. Finish the Microsoft setup steps first." }, 400);
      const state = crypto.randomUUID() + crypto.randomUUID();
      await sb.from("oauth_states").insert({ state, user_id: user.id, tz: body.tz || "America/Toronto" });
      const q = new URLSearchParams({
        client_id: c.ms_client_id, response_type: "code", redirect_uri: c.outlook_redirect_uri,
        response_mode: "query", scope: SCOPES, state, prompt: "select_account",
      });
      return json({ url: `https://login.microsoftonline.com/${c.ms_tenant_id}/oauth2/v2.0/authorize?${q}` });
    }
    if (body.action === "sync") return json(await syncUser(user.id));
    if (body.action === "disconnect") {
      const { data: mine } = await sb.from("calendar_events").select("id").eq("user_id", user.id).not("outlook_id", "is", null);
      await removeLocal((mine ?? []).map((r: Row) => r.id));
      await sb.from("outlook_accounts").delete().eq("user_id", user.id);
      return json({ ok: true });
    }
    if (body.action === "respond") {
      const kind = ({ accept: "accept", tentative: "tentativelyAccept", decline: "decline" } as Record<string, string>)[body.response];
      if (!kind) return json({ error: "bad response" }, 400);
      const { data: ev } = await sb.from("calendar_events").select("*").eq("id", body.id).eq("user_id", user.id).maybeSingle();
      if (!ev || !ev.outlook_id) return json({ error: "Event isn't in Outlook yet" }, 400);
      const { data: acc } = await sb.from("outlook_accounts").select("*").eq("user_id", user.id).maybeSingle();
      if (!acc) return json({ error: "Outlook isn't connected" }, 400);
      const target = body.series && ev.series_master_id ? ev.series_master_id : ev.outlook_id;
      const res = await graph(acc, "POST", `/me/events/${encodeURIComponent(target)}/${kind}`, { sendResponse: true, comment: body.comment || "" });
      if (!res.ok) return json({ error: gErr(res) }, 400);
      if (kind === "decline") await removeLocal([ev.id]);
      else {
        const fresh = await graph(acc, "GET", `/me/events/${encodeURIComponent(ev.outlook_id)}`);
        if (fresh.ok) await upsertRemote(acc, [fresh.data!]);
      }
      return json({ ok: true });
    }
    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});

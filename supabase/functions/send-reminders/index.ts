// Sends Web Push reminders for Aboud's Tasks.
// Called every minute by pg_cron (header x-cron-secret), or by the app with
// the user's login token and {"test": true} to send a test notification.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string; tz: string };

let configured = false;
let cronSecret = "";
async function setup() {
  if (configured) return;
  const { data, error } = await sb.rpc("get_push_config");
  if (error) throw error;
  webpush.setVapidDetails(data.vapid_subject, data.vapid_public_key, data.vapid_private_key);
  cronSecret = data.cron_secret;
  configured = true;
}

async function sendTo(subs: Sub[], payload: Record<string, unknown>) {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 6, urgency: "high" },
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push failed", code, (err as Error).message);
    }
  }
  return sent;
}

function localParts(tz: string, d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) };
}

async function sweep() {
  const { data: subs } = await sb.from("push_subscriptions").select("*");
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  let reminders = 0, digests = 0;

  // 1) Tasks whose reminder time has arrived (ignore ones more than a day late).
  const now = new Date();
  const { data: due } = await sb.from("tasks")
    .select("id,user_id,title,notes")
    .eq("done", false).is("reminded_at", null)
    .lte("reminder_at", now.toISOString())
    .gte("reminder_at", new Date(now.getTime() - 86400000).toISOString());
  for (const t of due ?? []) {
    const us = byUser.get(t.user_id) ?? [];
    if (us.length) {
      await sendTo(us, { title: t.title || "Reminder", body: t.notes ? String(t.notes).slice(0, 120) : "Reminder", tag: t.id, url: `/?task=${t.id}` });
      reminders++;
    }
    await sb.from("tasks").update({ reminded_at: now.toISOString() }).eq("id", t.id);
  }

  // 1b) Calendar event reminders (reminder_minutes before the start).
  const { data: evs } = await sb.from("calendar_events")
    .select("id,user_id,subject,location,start_at,is_all_day,reminder_minutes,response_status")
    .is("reminded_at", null).not("reminder_minutes", "is", null)
    .eq("is_cancelled", false).neq("event_type", "seriesMaster").neq("sync_state", "pending_delete")
    .gte("start_at", new Date(now.getTime() - 30 * 60000).toISOString())
    .lte("start_at", new Date(now.getTime() + 8 * 86400000).toISOString());
  for (const e of evs ?? []) {
    const start = new Date(e.start_at).getTime();
    if (start - e.reminder_minutes * 60000 > now.getTime()) continue;
    if (e.response_status === "declined") continue;
    const us = byUser.get(e.user_id) ?? [];
    if (us.length) {
      const mins = Math.round((start - now.getTime()) / 60000);
      const when = e.is_all_day ? "Today" : mins <= 0 ? "Now" : mins < 60 ? `In ${mins} min` : `At ${new Date(start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: us[us.length - 1].tz || "America/Toronto" })}`;
      await sendTo(us, { title: e.subject || "Event", body: when + (e.location ? ` · ${e.location}` : ""), tag: "ev-" + e.id, url: `/?event=${e.id}` });
      reminders++;
    }
    await sb.from("calendar_events").update({ reminded_at: now.toISOString(), touched_by: "sync" }).eq("id", e.id);
  }

  // 2) 9 am digest of tasks due today that have no reminder time.
  for (const [uid, us] of byUser) {
    const { date, hour } = localParts(us[us.length - 1].tz || "America/Toronto");
    if (hour !== 9) continue;
    const { data: today } = await sb.from("tasks")
      .select("id,title,due_notified")
      .eq("user_id", uid).eq("done", false).eq("due", date).is("reminder_at", null);
    const fresh = (today ?? []).filter((t) => t.due_notified !== date);
    if (!fresh.length) continue;
    const body = fresh.length === 1 ? fresh[0].title : fresh.map((t) => "• " + t.title).join("\n");
    await sendTo(us, {
      title: fresh.length === 1 ? "Due today" : `${fresh.length} tasks due today`,
      body, tag: "due-" + date, url: fresh.length === 1 ? `/?task=${fresh[0].id}` : "/",
    });
    await sb.from("tasks").update({ due_notified: date }).in("id", fresh.map((t) => t.id));
    digests++;
  }
  // 3) Morning weather at the chosen hour (default 7 am) in the user's time zone.
  let weather = 0;
  const { data: settings } = await sb.from("user_settings").select("*").eq("weather_enabled", true).not("lat", "is", null);
  for (const st of settings ?? []) {
    const us = byUser.get(st.user_id) ?? [];
    if (!us.length) continue;
    const { date, hour } = localParts(st.tz || "America/Toronto");
    if (hour !== (st.weather_hour ?? 7) || st.weather_sent_on === date) continue;
    try {
      const msg = await weatherMessage(st.lat, st.lon, st.place);
      await sendTo(us, { ...msg, tag: "weather-" + date, url: "/" });
      await sb.from("user_settings").update({ weather_sent_on: date }).eq("user_id", st.user_id);
      weather++;
    } catch (err) {
      console.error("weather failed", (err as Error).message);
    }
  }
  // 4) Evening mood check-in (default 9 pm) if today isn't logged yet.
  let mood = 0;
  const { data: allSettings } = await sb.from("user_settings").select("user_id,tz,mood_reminder_enabled,mood_hour,mood_sent_on");
  const setBy = new Map((allSettings ?? []).map((x) => [x.user_id, x]));
  for (const [uid, us] of byUser) {
    const st = setBy.get(uid);
    if (st && st.mood_reminder_enabled === false) continue;
    const tz = st?.tz || us[us.length - 1].tz || "America/Toronto";
    const { date, hour } = localParts(tz);
    if (hour !== (st?.mood_hour ?? 21) || st?.mood_sent_on === date) continue;
    const { data: logged } = await sb.from("mood_entries").select("id").eq("user_id", uid).eq("day", date).maybeSingle();
    if (!logged) {
      await sendTo(us, { title: "How was your day?", body: "Tap to log your mood.", tag: "mood-" + date, url: `/?mood=${date}` });
      mood++;
    }
    await sb.from("user_settings").upsert({ user_id: uid, mood_sent_on: date });
  }
  // 5) Routines: fixed-time notifications on chosen weekdays (sent within 15 minutes of the time).
  let routines = 0;
  const { data: rts } = await sb.from("routines").select("*").eq("enabled", true);
  for (const rt of rts ?? []) {
    const us = byUser.get(rt.user_id) ?? [];
    if (!us.length) continue;
    const st = setBy.get(rt.user_id);
    const tz = st?.tz || us[us.length - 1].tz || "America/Toronto";
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(now);
    const g = (t: string) => f.find((p) => p.type === t)!.value;
    const date = `${g("year")}-${g("month")}-${g("day")}`;
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
    const mins = Number(g("hour")) * 60 + Number(g("minute"));
    const [h, m] = String(rt.at_time).split(":").map(Number);
    const due = h * 60 + m;
    if (!(rt.days ?? []).includes(dow) || rt.last_sent_on === date || mins < due || mins > due + 15) continue;
    await sendTo(us, { title: rt.title, body: rt.body, tag: "rt-" + rt.id, url: "/", open: rt.open_url || undefined });
    await sb.from("routines").update({ last_sent_on: date }).eq("id", rt.id);
    routines++;
  }
  return { reminders, digests, weather, mood, routines };
}

// ---------- weather (Open-Meteo, no key needed) ----------
const WMO: Record<number, [string, string]> = {
  0: ["Clear", "☀️"], 1: ["Mostly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Cloudy", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Freezing fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"], 56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"], 66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 77: ["Snow grains", "🌨️"],
  80: ["Light showers", "🌦️"], 81: ["Showers", "🌧️"], 82: ["Heavy showers", "⛈️"], 85: ["Snow showers", "🌨️"], 86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorms", "⛈️"], 96: ["Thunderstorms with hail", "⛈️"], 99: ["Thunderstorms with hail", "⛈️"],
};
async function weatherMessage(lat: number, lon: number, place?: string | null) {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: "auto", forecast_days: "1",
    current: "temperature_2m,apparent_temperature,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max",
    hourly: "precipitation_probability,weather_code",
  });
  const res = await fetch("https://api.open-meteo.com/v1/forecast?" + q);
  if (!res.ok) throw new Error("weather service " + res.status);
  const w = await res.json();
  const d = w.daily, c = w.current;
  const [label, icon] = WMO[d.weather_code[0]] ?? ["", "🌡️"];
  const r = (n: number) => Math.round(n);
  const hi = r(d.temperature_2m_max[0]), lo = r(d.temperature_2m_min[0]);
  const parts: string[] = [];
  parts.push(`${label}. Now ${r(c.temperature_2m)}°, feels like ${r(c.apparent_temperature)}°.`);
  const pop = d.precipitation_probability_max[0];
  if (pop >= 30) {
    const nowHour = Number(String(c.time).slice(11, 13));
    const idx = (w.hourly.precipitation_probability as number[]).findIndex((p, i) => p >= 50 && Number(String(w.hourly.time[i]).slice(11, 13)) >= nowHour);
    const snowy = [71, 73, 75, 77, 85, 86].includes(d.weather_code[0]);
    const what = snowy ? "Snow" : "Rain";
    if (idx >= 0) {
      const h = Number(String(w.hourly.time[idx]).slice(11, 13));
      parts.push(`${what} likely from ${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h < 12 ? "AM" : "PM"} (${pop}%).`);
    } else parts.push(`${pop}% chance of ${what.toLowerCase()}.`);
  }
  const wind = r(d.wind_speed_10m_max[0]);
  if (wind >= 25) parts.push(`Wind up to ${wind} km/h.`);
  const uv = d.uv_index_max?.[0];
  if (uv >= 6) parts.push(`High UV (${r(uv)}), wear sunscreen.`);
  return { title: `${icon} ${place ? place + ": " : ""}${hi}° / ${lo}°`, body: parts.join(" ") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    await setup();
    if (req.headers.get("x-cron-secret") === cronSecret && cronSecret) return json(await sweep());
    const body = await req.json().catch(() => ({}));

    // Test notification for the signed-in user.
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", user.id);
    if (body.weather) {
      // Send today's weather now (used when turning the feature on).
      const { data: st } = await sb.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();
      if (!st || st.lat == null) return json({ error: "No location saved yet" }, 400);
      const msg = await weatherMessage(st.lat, st.lon, st.place);
      const sent = await sendTo((subs ?? []) as Sub[], { ...msg, tag: "weather-test", url: "/" });
      return json({ sent, ...msg });
    }
    const sent = await sendTo((subs ?? []) as Sub[], { title: "Notifications are on", body: "You'll get your task reminders here.", tag: "test", url: "/" });
    return json({ sent });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});

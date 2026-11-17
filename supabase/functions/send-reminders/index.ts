// Sends Web Push reminders for Aboud's Tasks.
// Called every 5 minutes by pg_cron (header x-cron-secret), or by the app with
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
  return { reminders, digests };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    await setup();
    if (req.headers.get("x-cron-secret") === cronSecret && cronSecret) return json(await sweep());

    // Test notification for the signed-in user.
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", user.id);
    const sent = await sendTo((subs ?? []) as Sub[], { title: "Notifications are on", body: "You'll get your task reminders here.", tag: "test", url: "/" });
    return json({ sent });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});

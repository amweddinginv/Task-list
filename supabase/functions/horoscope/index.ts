// Daily / weekly horoscope from Astrology.com for the signed-in user.
//   POST {sign?: "capricorn"}  ->  { yesterday, today, tomorrow, week, nextweek }: { date, text, url }
// Pages are cached for 2 hours in public.horoscope_cache.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const PAGES: Record<string, (s: string) => string> = {
  yesterday: (s) => `https://www.astrology.com/horoscope/daily/yesterday/${s}.html`,
  today: (s) => `https://www.astrology.com/horoscope/daily/${s}.html`,
  tomorrow: (s) => `https://www.astrology.com/horoscope/daily/tomorrow/${s}.html`,
  week: (s) => `https://www.astrology.com/horoscope/weekly-overview/${s}.html`,
  nextweek: (s) => `https://www.astrology.com/horoscope/weekly-overview/next-week/${s}.html`,
};
const MAX_AGE = 2 * 3600 * 1000;

const decode = (t: string) => t
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
  .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&hellip;/g, "…")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

async function fetchPage(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Accept-Language": "en-US,en",
    },
  });
  const html = await res.text();
  if (!res.ok) throw new Error(`Astrology.com answered ${res.status}`);
  let date = "", block = "";
  const start = html.indexOf('<div id="content"');
  const week = /<h4[^>]*>\s*(Week of [^<]+?)\s*<\/h4>/.exec(html);
  if (start >= 0) {
    // Daily pages: <span id="content-date">…</span> … <div id="content"><p>…</p></div>
    date = /id="content-date"[^>]*>([^<]+)</.exec(html)?.[1]?.trim() ?? "";
    const after = html.slice(html.indexOf(">", start) + 1);
    block = after.slice(0, after.indexOf("</div>"));
  } else if (week) {
    // Weekly pages: <h4>Week of …</h4> followed by the paragraphs.
    date = week[1];
    const after = html.slice((week.index ?? 0) + week[0].length);
    block = after.slice(0, after.indexOf("</div>"));
  } else throw new Error("Couldn't find the horoscope on the page");
  const paras = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => decode(m[1].replace(/<p[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[​ ]/g, " ").trim())
    .filter((p) => p.length > 0);
  if (!paras.length) throw new Error("The horoscope text was empty");
  return { date: decode(date), text: paras.join("\n\n") };
}

async function get(sign: string, period: string) {
  const { data: cached } = await sb.from("horoscope_cache").select("*").eq("sign", sign).eq("period", period).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < MAX_AGE) {
    return { date: cached.date_label, text: cached.body, url: cached.source_url };
  }
  const url = PAGES[period](sign);
  try {
    const { date, text } = await fetchPage(url);
    await sb.from("horoscope_cache").upsert({ sign, period, date_label: date, body: text, source_url: url, fetched_at: new Date().toISOString() });
    return { date, text, url };
  } catch (err) {
    if (cached) return { date: cached.date_label, text: cached.body, url: cached.source_url, stale: true };
    return { date: "", text: "", url, error: (err as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await sb.auth.getUser(token);
    let allowed = !!user;
    if (!allowed && req.headers.get("x-cron-secret")) {
      const { data: cfg } = await sb.rpc("get_push_config");
      allowed = !!cfg?.cron_secret && req.headers.get("x-cron-secret") === cfg.cron_secret;
    }
    if (!allowed) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const sign = SIGNS.includes(String(body.sign).toLowerCase()) ? String(body.sign).toLowerCase() : "capricorn";
    const periods = ["yesterday", "today", "tomorrow", "week", "nextweek"];
    const results = await Promise.all(periods.map((p) => get(sign, p)));
    return json({ sign, ...Object.fromEntries(periods.map((p, i) => [p, results[i]])) });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});

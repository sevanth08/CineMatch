// Supabase Edge Function "tmdb": read-only TMDB proxy for CineMatch.
// - Deploy with "Verify JWT" OFF: the browser sends a publishable key (not a JWT), and browsing must work signed out.
// - The TMDB token exists only in the TMDB_READ_TOKEN secret and is never returned to the browser.
// Abuse protection (all best-effort, in-memory per function instance; see README notes):
//   1) only GET/OPTIONS; 2) browser Origin must be on the allow-list; 3) whitelisted actions + validated params;
//   4) per-IP rate limit; 5) response cache so repeat queries never reach TMDB; 6) upstream timeout; 7) capped result size.
const ALLOWED = ["https://sevanth08.github.io", "http://localhost:8000", "http://localhost:3000", "http://127.0.0.1:5500"];
const LIMIT = 60, WINDOW_MS = 60_000, CACHE_MS = 300_000, MAX_KEYS = 2000;
const hits = new Map<string, number[]>();
const cache = new Map<string, { t: number; body: string }>();

function limited(ip: string, now: number): number {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) { hits.set(ip, recent); return Math.ceil((WINDOW_MS - (now - recent[0])) / 1000); }
  recent.push(now); hits.set(ip, recent);
  if (hits.size > MAX_KEYS) for (const [k, v] of hits) if (now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
  return 0;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const okOrigin = ALLOWED.includes(origin);
  const cors = { "Access-Control-Allow-Origin": okOrigin ? origin : ALLOWED[0], "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Vary": "Origin" };
  const json = (b: unknown, s = 200, extra: Record<string, string> = {}) => new Response(typeof b === "string" ? b : JSON.stringify(b),
    { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": s === 200 ? "public, max-age=300" : "no-store", ...extra } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!okOrigin) return json({ error: "Origin not allowed" }, 403);

  const now = Date.now();
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const wait = limited(ip, now);
  if (wait) return json({ error: "Too many requests. Please slow down." }, 429, { "Retry-After": String(wait) });

  const token = Deno.env.get("TMDB_READ_TOKEN");
  if (!token) return json({ error: "TMDB is not configured" }, 500);

  const q = new URL(req.url).searchParams;
  const ids = (k: string) => { const v = q.get(k) ?? ""; return /^[0-9,|]{0,60}$/.test(v) ? v : ""; };
  const page = Math.min(3, Math.max(1, parseInt(q.get("page") ?? "1") || 1));
  const p = new URLSearchParams({ language: "en-US", include_adult: "false", page: String(page) });
  let path = "";
  const action = q.get("action") ?? "";
  if (action === "trending") path = "/trending/movie/week";
  else if (action === "search") {
    // deno-lint-ignore no-control-regex
    const s = (q.get("q") ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 100);
    if (!s) return json({ error: "Missing search text" }, 400);
    path = "/search/movie"; p.set("query", s);
  } else if (action === "discover") {
    path = "/discover/movie"; p.set("sort_by", "popularity.desc"); p.set("vote_count.gte", "300");
    const w = ids("with"), x = ids("without"), r = parseFloat(q.get("minr") ?? "");
    if (w) p.set("with_genres", w);
    if (x) p.set("without_genres", x);
    if (r >= 0 && r <= 9) p.set("vote_average.gte", String(r));
  } else return json({ error: "Unknown action" }, 400);

  const key = `${path}?${p}`;
  const hit = cache.get(key);
  if (hit && now - hit.t < CACHE_MS) return json(hit.body);
  try {
    const r = await fetch(`https://api.themoviedb.org/3${key}`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return json({ error: "TMDB request failed" }, 502);
    const d = await r.json();
    const body = JSON.stringify({ results: (d.results ?? []).slice(0, 18).map((m: any) => ({
      id: m.id, title: m.title, year: (m.release_date ?? "").slice(0, 4), rating: m.vote_average, votes: m.vote_count,
      overview: m.overview, genre_ids: m.genre_ids ?? [], poster_path: m.poster_path ?? null })) });
    if (cache.size >= 200) cache.delete(cache.keys().next().value as string);
    cache.set(key, { t: now, body });
    return json(body);
  } catch { return json({ error: "TMDB unreachable" }, 502); }
});

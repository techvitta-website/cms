// Supabase Edge Function: intern-source
// ADDITIVE, self-contained. Public-web candidate SOURCING (leads only).
//
// Given colleges / locations / skills, it discovers PUBLIC candidate leads and
// stores them in `sourced_leads`:
//   - GitHub user search (keyless; richer if GITHUB_TOKEN is set) by
//     location + language(skill) — great for student developers.
//   - Optional public web / resume-PDF search via Google Programmable Search
//     (GOOGLE_CSE_KEY + GOOGLE_CSE_CX) or SerpAPI (SERPAPI_KEY) — surfaces
//     publicly-posted resume PDFs, portfolios, and public profile links.
//
// It NEVER scrapes gated/recruiter databases and only touches public data.
// Results are leads (name + link + snippet) for a human to review & contact.
//
// POST body:
//   { colleges?: string[], locations?: string[], skills?: string[],
//     useGithub?: boolean, useWeb?: boolean, limit?: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENV = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  GITHUB_TOKEN: Deno.env.get("GITHUB_TOKEN") ?? "",
  GOOGLE_CSE_KEY: Deno.env.get("GOOGLE_CSE_KEY") ?? "",
  GOOGLE_CSE_CX: Deno.env.get("GOOGLE_CSE_CX") ?? "",
  SERPAPI_KEY: Deno.env.get("SERPAPI_KEY") ?? "",
  GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") ?? "",
  GEMINI_MODEL: Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash",
};

type Lead = {
  name: string | null;
  kind: string; // github | web | linkedin | portfolio
  source: string;
  url: string;
  snippet: string | null;
  location: string | null;
  college: string | null;
  skills: string[];
  query: string;
};

function getAdminClient() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function clip(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length > 0)
    .slice(0, max);
}

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- GitHub sourcing (keyless works; token = higher limits + enrichment) ----
async function githubSearch(
  locations: string[],
  skills: string[],
  maxLeads: number,
): Promise<Lead[]> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "techvitta-intern-source",
  };
  if (ENV.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${ENV.GITHUB_TOKEN}`;

  // Build up to 6 (location × skill) query pairs to respect rate limits.
  const pairs: { loc: string | null; skill: string | null }[] = [];
  const locs = locations.length ? locations : [null];
  const sks = skills.length ? skills : [null];
  for (const loc of locs) {
    for (const skill of sks) {
      pairs.push({ loc, skill });
      if (pairs.length >= 6) break;
    }
    if (pairs.length >= 6) break;
  }

  const leads: Lead[] = [];
  const seen = new Set<string>();
  const perPair = Math.max(3, Math.ceil(maxLeads / pairs.length));

  for (const { loc, skill } of pairs) {
    if (leads.length >= maxLeads) break;
    const qParts = ["type:user"];
    if (loc) qParts.push(`location:${JSON.stringify(loc)}`);
    if (skill) qParts.push(`language:${skill}`);
    const q = qParts.join(" ");
    const url = `https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=${Math.min(20, perPair)}`;
    try {
      const resp = await fetch(url, { headers });
      if (resp.status === 403) {
        // rate limited — stop hitting GitHub further this run
        break;
      }
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const item of data.items ?? []) {
        const html = item?.html_url as string;
        if (!html || seen.has(html)) continue;
        seen.add(html);
        leads.push({
          name: item?.login ?? null,
          kind: "github",
          source: "GitHub",
          url: html,
          snippet: `GitHub developer${skill ? ` · ${skill}` : ""}${loc ? ` · ${loc}` : ""}`,
          location: loc,
          college: null,
          skills: skill ? [skill] : [],
          query: q,
        });
        if (leads.length >= maxLeads) break;
      }
    } catch (_err) {
      // ignore this pair
    }
    await sleep(700); // be gentle with the search rate limit
  }

  // Optional enrichment when a token is available (real name, bio, portfolio).
  if (ENV.GITHUB_TOKEN) {
    for (const lead of leads.slice(0, 20)) {
      try {
        const login = lead.url.split("/").pop();
        if (!login) continue;
        const resp = await fetch(`https://api.github.com/users/${login}`, { headers });
        if (!resp.ok) continue;
        const u = await resp.json();
        if (u?.name) lead.name = u.name;
        const bioBits = [u?.bio, u?.company, u?.location].filter(Boolean).join(" · ");
        if (bioBits) lead.snippet = String(bioBits).slice(0, 300);
        if (u?.location && !lead.location) lead.location = u.location;
        if (u?.blog) lead.snippet = `${lead.snippet ?? ""} · ${u.blog}`.slice(0, 300);
      } catch (_err) {
        // enrichment is best-effort
      }
    }
  }

  return leads;
}

// ---- Web / resume-PDF search via Google CSE or SerpAPI (optional) ----
function classifyLink(link: string): string {
  const l = link.toLowerCase();
  if (l.includes("linkedin.com/in")) return "linkedin";
  if (l.endsWith(".pdf")) return "web";
  if (l.includes("github.io") || l.includes("portfolio") || l.includes("vercel.app") || l.includes("netlify.app")) {
    return "portfolio";
  }
  return "web";
}

async function googleCse(query: string, num: number): Promise<Lead[]> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${ENV.GOOGLE_CSE_KEY}&cx=${ENV.GOOGLE_CSE_CX}&q=${encodeURIComponent(query)}&num=${Math.min(10, num)}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  const leads: Lead[] = [];
  for (const item of data.items ?? []) {
    const link = item?.link as string;
    if (!link) continue;
    leads.push({
      name: item?.title ?? null,
      kind: classifyLink(link),
      source: "Web (Google)",
      url: link,
      snippet: item?.snippet ?? null,
      location: null,
      college: null,
      skills: [],
      query,
    });
  }
  return leads;
}

async function serpApi(query: string, num: number): Promise<Lead[]> {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=${Math.min(10, num)}&api_key=${ENV.SERPAPI_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  const leads: Lead[] = [];
  for (const item of data.organic_results ?? []) {
    const link = item?.link as string;
    if (!link) continue;
    leads.push({
      name: item?.title ?? null,
      kind: classifyLink(link),
      source: "Web (SerpAPI)",
      url: link,
      snippet: item?.snippet ?? null,
      location: null,
      college: null,
      skills: [],
      query,
    });
  }
  return leads;
}

// ---- Gemini + Google Search grounding (uses a GEMINI_API_KEY) ----
async function geminiSearch(
  colleges: string[],
  locations: string[],
  skills: string[],
  maxLeads: number,
): Promise<Lead[]> {
  if (!ENV.GEMINI_API_KEY) return [];
  const prompt =
    `Find up to ${maxLeads} PUBLIC online profiles of students or recent graduates suitable for an internship. ` +
    `Skills: ${skills.join(", ") || "any"}. Locations: ${locations.join(", ") || "any"}. ` +
    `Colleges: ${colleges.join(", ") || "any"}. ` +
    `Prefer GitHub profiles, personal portfolio sites, and publicly posted resume PDFs. ` +
    `For each person give their name and the direct public URL.`;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const cand = data?.candidates?.[0];
    const leads: Lead[] = [];
    const seen = new Set<string>();

    // 1) Grounding chunks: real, search-backed source URLs.
    const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
    for (const ch of chunks) {
      const uri = ch?.web?.uri as string | undefined;
      const title = (ch?.web?.title as string | undefined) ?? null;
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      leads.push({
        name: title,
        kind: classifyLink(title || uri),
        source: "Web (Gemini)",
        url: uri,
        snippet: title,
        location: locations[0] ?? null,
        college: colleges[0] ?? null,
        skills: skills.slice(0, 5),
        query: "gemini google_search",
      });
    }

    // 2) Any explicit URLs the model listed in its answer text.
    const text: string = cand?.content?.parts?.map((p: any) => p?.text ?? "").join(" ") ?? "";
    const urlMatches = text.match(/https?:\/\/[^\s)\]]+/g) ?? [];
    for (const raw of urlMatches) {
      const u = raw.replace(/[.,;]+$/, "");
      if (seen.has(u)) continue;
      seen.add(u);
      leads.push({
        name: null,
        kind: classifyLink(u),
        source: "Web (Gemini)",
        url: u,
        snippet: null,
        location: locations[0] ?? null,
        college: colleges[0] ?? null,
        skills: skills.slice(0, 5),
        query: "gemini google_search",
      });
    }

    return leads.slice(0, maxLeads);
  } catch (_err) {
    return [];
  }
}

async function webSearch(
  colleges: string[],
  locations: string[],
  skills: string[],
  maxLeads: number,
): Promise<Lead[]> {
  const hasCse = ENV.GOOGLE_CSE_KEY && ENV.GOOGLE_CSE_CX;
  const hasSerp = ENV.SERPAPI_KEY;
  // Prefer a dedicated search API; otherwise fall back to Gemini grounding.
  if (!hasCse && !hasSerp) {
    if (ENV.GEMINI_API_KEY) return await geminiSearch(colleges, locations, skills, maxLeads);
    return [];
  }

  // Build a few high-signal queries (bounded to keep quota use small).
  const skillStr = skills.slice(0, 3).join(" ");
  const queries: string[] = [];
  const locs = locations.length ? locations : [""];
  const colls = colleges.length ? colleges : [""];
  for (const loc of locs.slice(0, 2)) {
    for (const coll of colls.slice(0, 2)) {
      const ctx = [coll, loc].filter(Boolean).join(" ");
      queries.push(`resume filetype:pdf intern ${skillStr} ${ctx}`.trim());
      if (queries.length >= 4) break;
    }
    if (queries.length >= 4) break;
  }
  if (queries.length === 0) queries.push(`resume filetype:pdf intern ${skillStr}`.trim());

  const leads: Lead[] = [];
  const seen = new Set<string>();
  const perQuery = Math.max(4, Math.ceil(maxLeads / queries.length));
  for (const q of queries) {
    if (leads.length >= maxLeads) break;
    try {
      const batch = hasCse ? await googleCse(q, perQuery) : await serpApi(q, perQuery);
      for (const lead of batch) {
        if (seen.has(lead.url)) continue;
        seen.add(lead.url);
        // attach the context we searched with
        lead.college = colleges[0] ?? null;
        lead.location = locations[0] ?? null;
        lead.skills = skills.slice(0, 5);
        leads.push(lead);
        if (leads.length >= maxLeads) break;
      }
    } catch (_err) {
      // ignore this query
    }
    await sleep(300);
  }
  return leads;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(req.url);
    if (url.pathname.endsWith("/health")) {
      return jsonResponse({
        ok: true,
        service: "intern-source",
        github: true,
        githubToken: Boolean(ENV.GITHUB_TOKEN),
        web: Boolean((ENV.GOOGLE_CSE_KEY && ENV.GOOGLE_CSE_CX) || ENV.SERPAPI_KEY || ENV.GEMINI_API_KEY),
        gemini: Boolean(ENV.GEMINI_API_KEY),
      });
    }
    if (req.method !== "POST") {
      return jsonResponse({ ok: true, message: "intern-source online. POST { colleges, locations, skills, useGithub, useWeb, limit }" });
    }

    const payload = await req.json().catch(() => ({}));
    const colleges = clip(payload?.colleges, 5);
    const locations = clip(payload?.locations, 5);
    const skills = clip(payload?.skills, 8);
    const useGithub = payload?.useGithub !== false; // default on
    const useWeb = payload?.useWeb !== false; // default on (no-op without a key)
    const limit = Math.max(5, Math.min(60, Number(payload?.limit ?? 30)));

    if (colleges.length === 0 && locations.length === 0 && skills.length === 0) {
      return jsonResponse({ ok: false, error: "Provide at least one of: colleges, locations, skills." }, 400);
    }

    const all: Lead[] = [];
    if (useGithub) {
      try {
        all.push(...(await githubSearch(locations, skills, Math.ceil(limit * 0.6))));
      } catch (err) {
        console.warn("github source failed:", err);
      }
    }
    if (useWeb) {
      try {
        all.push(...(await webSearch(colleges, locations, skills, Math.ceil(limit * 0.6))));
      } catch (err) {
        console.warn("web source failed:", err);
      }
    }

    // De-dupe by URL across sources.
    const seen = new Set<string>();
    const leads = all.filter((l) => {
      if (!l.url || seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    }).slice(0, limit);

    // Persist (ignore duplicates via the unique url index).
    const supabase = getAdminClient();
    let saved = 0;
    for (const lead of leads) {
      const { error } = await supabase.from("sourced_leads").upsert(
        {
          name: lead.name,
          kind: lead.kind,
          source: lead.source,
          url: lead.url,
          snippet: lead.snippet,
          location: lead.location,
          college: lead.college,
          skills: lead.skills,
          query: lead.query,
          status: "New",
        },
        { onConflict: "url", ignoreDuplicates: true },
      );
      if (!error) saved++;
    }

    const webEnabled = Boolean((ENV.GOOGLE_CSE_KEY && ENV.GOOGLE_CSE_CX) || ENV.SERPAPI_KEY || ENV.GEMINI_API_KEY);
    return jsonResponse({
      ok: true,
      found: leads.length,
      saved,
      webEnabled,
      note: !webEnabled
        ? "Web/PDF search is off (no search-API key set). Showing GitHub leads only."
        : undefined,
      leads,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});

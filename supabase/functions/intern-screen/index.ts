// Supabase Edge Function: intern-screen
// ADDITIVE, self-contained. Does NOT touch ats-processor.
//
// Purpose: score already-uploaded intern resumes for the CMS "Intern Screening"
// page. Given a list of candidate ids, it downloads each resume from storage,
// extracts text, parses intern-specific fields (college, degree, branch,
// graduation year, CGPA, projects, certifications, skills) with GPT-4o-mini
// (heuristic fallback when no key / on failure), computes a weighted intern
// score against an optional target skill set, and writes the screening fields
// back onto the candidate row. Low scorers are flagged for review — this
// function never rejects anyone and never changes a candidate's status.
//
// Endpoints:
//   GET  /health                      -> { ok, openai }
//   POST /                            -> body { candidateIds: string[], targetSkills?: string[], targetRole?: string }
//                                        (also accepts { candidateId: string })

import "jsr:@supabase/functions-js/edge-runtime-polyfills";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

// pdfjs-dist for Deno via esm.sh (worker disabled in Edge runtime)
// deno-lint-ignore no-explicit-any
const pdfjsLib: any = await import("https://esm.sh/pdfjs-dist@3.11.174/legacy/build/pdf.mjs");

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENV = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY") ?? "",
  RESUMES_BUCKET:
    Deno.env.get("RESUMES_BUCKET") ??
    Deno.env.get("SUPABASE_RESUMES_BUCKET") ??
    "resumes-private",
};

type InternExtraction = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  college: string | null;
  degree: string | null;
  branch: string | null;
  graduation_year: number | null;
  cgpa: number | null;
  projects: string[];
  certifications: string[];
  coursework: string[];
  experience_years: number;
  education: string | null;
};

function getAdminClient() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function normalizeSkills(skills: string[] | null | undefined): string[] {
  const set = new Set<string>();
  for (const s of skills ?? []) {
    const v = String(s).trim().toLowerCase();
    if (v) set.add(v);
  }
  return Array.from(set);
}

function cleanList(items: unknown, max = 25): string[] {
  const out: string[] = [];
  if (Array.isArray(items)) {
    for (const it of items) {
      const v = String(it ?? "").trim();
      if (v) out.push(v.slice(0, 300));
      if (out.length >= max) break;
    }
  }
  return out;
}

async function safeJson<T = unknown>(text: string): Promise<T | null> {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function candidateBuckets(...overrides: Array<string | null | undefined>): string[] {
  const buckets = new Set<string>();
  for (const value of overrides) {
    const trimmed = (value ?? "").trim();
    if (trimmed.length > 0) buckets.add(trimmed);
  }
  buckets.add(ENV.RESUMES_BUCKET);
  buckets.add("resumes-private");
  buckets.add("resumes");
  return Array.from(buckets);
}

// Split a stored resume_url like "resumes-private/1699_abc.pdf" into bucket + key.
function splitResumeUrl(resumeUrl: string): { bucket: string | null; key: string } {
  let path = (resumeUrl || "").trim();
  path = path.replace(/^https?:\/\/[^/]+\//i, "");
  path = path.replace(/^storage\/v1\/object\//i, "");
  path = path.replace(/^(public|sign|download)\//i, "");
  path = path.replace(/^\//, "");
  const parts = path.split("/");
  if (parts.length >= 2 && (parts[0] === "resumes" || parts[0] === "resumes-private")) {
    return { bucket: parts[0], key: parts.slice(1).join("/") };
  }
  return { bucket: null, key: path };
}

async function downloadResumeBytes(
  supabase: ReturnType<typeof createClient>,
  resumeUrl: string,
): Promise<Uint8Array | null> {
  const { bucket, key } = splitResumeUrl(resumeUrl);
  const buckets = candidateBuckets(bucket);
  const fileName = key.includes("/") ? key.split("/").pop()! : key;
  for (const b of buckets) {
    for (const candidateKey of [key, fileName]) {
      const { data, error } = await supabase.storage.from(b).download(candidateKey);
      if (!error && data) {
        return new Uint8Array(await data.arrayBuffer());
      }
    }
  }
  return null;
}

// Extract PDF text from bytes without a worker in Edge (same approach as ats-processor).
async function extractPdfTextFromBytes(bytes: Uint8Array): Promise<string> {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = undefined;
    const loadingTask = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    let text = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map((it: { str: string }) => it.str).join(" ");
      text += pageText + "\n\n";
    }
    return text.trim();
  } catch (_err) {
    try {
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const decoded = decoder.decode(bytes);
      return decoded.replace(/\x00/g, "").slice(0, 200000);
    } catch {
      throw _err;
    }
  }
}

const INTERN_SKILL_DICT = [
  "javascript", "typescript", "react", "redux", "next.js", "vue", "angular",
  "node", "express", "html", "css", "tailwind", "bootstrap",
  "java", "spring", "kotlin", "c", "c++", "c#", ".net",
  "python", "django", "flask", "fastapi", "pandas", "numpy", "scikit-learn",
  "machine learning", "ml", "ai", "nlp", "deep learning", "tensorflow", "pytorch",
  "sql", "postgres", "postgresql", "mysql", "mongodb", "redis", "firebase", "supabase",
  "graphql", "rest", "docker", "kubernetes", "git", "github", "linux",
  "aws", "gcp", "azure", "android", "ios", "swift", "flutter", "react native",
  "excel", "power bi", "tableau", "data analysis", "figma",
];

function localHeuristicIntern(resumeText: string, fileName: string): InternExtraction {
  const lower = resumeText.toLowerCase();
  const emailMatch = resumeText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  const email = emailMatch?.[0]?.toLowerCase() ?? null;
  const phoneMatch = resumeText.match(/(\+?\d[\d\s().-]{7,}\d)/g);
  const phoneRaw = phoneMatch?.[0] ?? null;
  const phone = phoneRaw ? phoneRaw.replace(/[^+\d]/g, "") : null;

  const skills = normalizeSkills(INTERN_SKILL_DICT.filter((k) => lower.includes(k)));

  const degreeMatch = resumeText.match(
    /(B\.?Tech|BTech|B\.?E\.?|Bachelor|M\.?Tech|MTech|MCA|BCA|MBA|B\.?Sc|M\.?Sc|Ph\.?D|Diploma)[^\n]{0,80}/i,
  );
  const degree = degreeMatch ? degreeMatch[0].trim().slice(0, 120) : null;

  const branchMatch = resumeText.match(
    /(Computer Science|Information Technology|Electronics|Mechanical|Electrical|Civil|Data Science|Artificial Intelligence|CSE|ECE|EEE|IT)[^\n]{0,40}/i,
  );
  const branch = branchMatch ? branchMatch[0].trim().slice(0, 80) : null;

  const collegeMatch = resumeText.match(
    /([A-Z][A-Za-z.&'’ -]{4,60}(University|Institute|College|School of|Academy))/,
  );
  const college = collegeMatch ? collegeMatch[0].trim().slice(0, 120) : null;

  const yearMatch = lower.match(/(20\d{2})\s*[-–to]{0,4}\s*(20\d{2})/);
  const gradYear = yearMatch ? parseInt(yearMatch[2], 10) : null;

  const cgpaMatch = lower.match(/(cgpa|gpa|c\.g\.p\.a)\D{0,6}(\d{1,2}(?:\.\d{1,2})?)/);
  const pctMatch = lower.match(/(\d{2}(?:\.\d{1,2})?)\s*%/);
  const cgpa = cgpaMatch
    ? parseFloat(cgpaMatch[2])
    : pctMatch
    ? parseFloat(pctMatch[1])
    : null;

  const certMatches = resumeText.match(/(certified|certification|certificate)[^\n]{0,80}/gi) ?? [];
  const certifications = cleanList(certMatches.slice(0, 8));

  const nameFromFile = fileName
    .replace(/\.(pdf|docx?)$/i, "")
    .replace(/^\d+[_-]?\d*[_-]?\d*[_-]?/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(resume|cv|curriculum|vitae)\b/gi, "")
    .trim();
  const firstLine = resumeText.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  const name = (nameFromFile.length >= 3 ? nameFromFile : firstLine.slice(0, 60)) || null;

  return {
    name,
    email,
    phone,
    skills,
    college,
    degree,
    branch,
    graduation_year: gradYear,
    cgpa,
    projects: [],
    certifications,
    coursework: [],
    experience_years: 0,
    education: degree,
  };
}

async function callOpenAIIntern(resumeText: string): Promise<InternExtraction | null> {
  if (!ENV.OPENAI_API_KEY) return null;
  const sys = "You are a precise resume parser for a college-intern hiring pipeline. Return STRICT JSON only.";
  const user = `Parse the intern/student resume text below. Return ONLY JSON with these keys:
{
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "skills": string[],                 // technical + tools, lowercase
  "college": string | null,           // university / institute name
  "degree": string | null,            // e.g. "B.Tech", "BCA", "M.Tech"
  "branch": string | null,            // specialization e.g. "Computer Science"
  "graduation_year": number | null,   // expected or actual passing year (YYYY)
  "cgpa": number | null,              // CGPA/GPA as a number; if only a percentage is given, put the percentage number
  "projects": string[],              // short one-line titles/descriptions of projects
  "certifications": string[],        // course/certification names
  "coursework": string[],            // relevant subjects/coursework
  "experience_years": number         // internships/work; 0 for freshers
}
Do not invent data. Use null / [] when a field is absent.

Resume text:
${resumeText.slice(0, 30000)}`;

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  };
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ENV.OPENAI_API_KEY}`,
  };
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
      const data = await resp.json();
      const jsonText: string = data.choices?.[0]?.message?.content ?? "";
      const parsed = await safeJson<Record<string, unknown>>(jsonText);
      if (!parsed) throw new Error("Invalid JSON from model");
      const gy = Number(parsed.graduation_year);
      const cg = Number(parsed.cgpa);
      return {
        name: (parsed.name as string) ?? null,
        email: (parsed.email as string) ?? null,
        phone: (parsed.phone as string) ?? null,
        skills: normalizeSkills((parsed.skills as string[]) ?? []),
        college: (parsed.college as string) ?? null,
        degree: (parsed.degree as string) ?? null,
        branch: (parsed.branch as string) ?? null,
        graduation_year: Number.isFinite(gy) && gy > 1990 && gy < 2100 ? Math.trunc(gy) : null,
        cgpa: Number.isFinite(cg) && cg > 0 ? cg : null,
        projects: cleanList(parsed.projects),
        certifications: cleanList(parsed.certifications),
        coursework: cleanList(parsed.coursework),
        experience_years: Math.max(0, Math.min(10, Number(parsed.experience_years ?? 0))) || 0,
        education: (parsed.degree as string) ?? null,
      };
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  console.warn("OpenAI intern extraction failed after retries:", lastError);
  return null;
}

function normalizeCgpa(cgpa: number | null): number | null {
  if (cgpa == null || !Number.isFinite(cgpa)) return null;
  const c = Number(cgpa);
  if (c > 10) return Math.max(0, Math.min(1, c / 100)); // percentage
  if (c > 4) return Math.max(0, Math.min(1, c / 10)); // out of 10
  return Math.max(0, Math.min(1, c / 4)); // out of 4
}

type Scored = { score: number; tier: string; rationale: string; flags: string[] };

// Weighted intern rubric: skills 45%, projects 25%, coursework/education 15%,
// CGPA 10%, certifications 5%. Job-aware when targetSkills is provided.
function computeInternScore(fields: InternExtraction, targetSkills: string[]): Scored {
  const skills = normalizeSkills(fields.skills);
  const targets = normalizeSkills(targetSkills);

  let matched: string[] = [];
  let skillScore: number;
  if (targets.length > 0) {
    matched = targets.filter((t) => skills.some((s) => s === t || s.includes(t) || t.includes(s)));
    skillScore = matched.length / targets.length;
  } else {
    skillScore = Math.min(1, skills.length / 8);
  }

  const projectCount = fields.projects?.length ?? 0;
  const projectScore = Math.min(1, projectCount / 3);

  const hasEdu = Boolean(fields.degree || fields.branch);
  let courseworkScore = hasEdu ? 0.65 : 0.35;
  if (targets.length > 0) {
    const eduText = `${fields.branch ?? ""} ${fields.degree ?? ""} ${(fields.coursework ?? []).join(" ")}`.toLowerCase();
    if (targets.some((t) => eduText.includes(t))) courseworkScore = 1;
  }

  const cgpaNorm = normalizeCgpa(fields.cgpa);
  const cgpaScore = cgpaNorm == null ? 0.4 : cgpaNorm; // neutral when unknown

  const certScore = Math.min(1, (fields.certifications?.length ?? 0) / 3);

  const score = Math.round(
    (skillScore * 0.45 +
      projectScore * 0.25 +
      courseworkScore * 0.15 +
      cgpaScore * 0.10 +
      certScore * 0.05) * 100,
  );

  const tier = score >= 75 ? "Top" : score >= 55 ? "Consider" : score >= 35 ? "Review" : "Low";

  const flags: string[] = [];
  if (fields.cgpa == null) flags.push("no_cgpa");
  if (projectCount === 0) flags.push("no_projects");
  if (skills.length === 0) flags.push("no_skills");
  if (!fields.email) flags.push("no_email");
  const nowYear = new Date().getFullYear();
  if (fields.graduation_year && fields.graduation_year >= nowYear && fields.graduation_year <= nowYear + 1) {
    flags.push("graduating_soon");
  }

  const bits: string[] = [];
  if (targets.length > 0) {
    bits.push(`${matched.length}/${targets.length} target skills${matched.length ? ` (${matched.slice(0, 6).join(", ")})` : ""}`);
  } else {
    bits.push(`${skills.length} skills detected`);
  }
  bits.push(`${projectCount} project${projectCount === 1 ? "" : "s"}`);
  if (fields.cgpa != null) bits.push(`CGPA ${fields.cgpa}`);
  if (fields.branch) bits.push(fields.branch);
  const rationale = `${tier} — ${bits.join(" · ")}`;

  return { score, tier, rationale, flags };
}

async function screenCandidate(
  supabase: ReturnType<typeof createClient>,
  candidateId: string,
  targetSkills: string[],
): Promise<Json> {
  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("id, full_name, email, phone, resume_url, skills")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw error;
  if (!candidate) return { candidateId, ok: false, error: "candidate not found" };
  if (!candidate.resume_url) return { candidateId, ok: false, error: "no resume_url" };

  const bytes = await downloadResumeBytes(supabase, candidate.resume_url);
  if (!bytes) return { candidateId, ok: false, error: "resume download failed" };

  const fileName = candidate.resume_url.split("/").pop() ?? "";
  const text = await extractPdfTextFromBytes(bytes);
  const ai = await callOpenAIIntern(text);
  const fields = ai ?? localHeuristicIntern(text, fileName);

  const scored = computeInternScore(fields, targetSkills);

  // Merge skills: keep whatever was already on the row, add parsed ones.
  const existingSkills = Array.isArray(candidate.skills) ? (candidate.skills as string[]) : [];
  const mergedSkills = normalizeSkills([...existingSkills, ...fields.skills]);

  const update: Record<string, unknown> = {
    college: fields.college,
    degree: fields.degree,
    branch: fields.branch,
    graduation_year: fields.graduation_year,
    cgpa: fields.cgpa,
    projects: fields.projects,
    certifications: fields.certifications,
    skills: mergedSkills,
    experience_years: fields.experience_years,
    education: fields.education,
    screening_score: scored.score,
    screening_tier: scored.tier,
    screening_rationale: scored.rationale,
    intern_flags: scored.flags,
    resume_text: text.slice(0, 20000),
    resume_processed: true,
    screened_at: new Date().toISOString(),
  };
  // Only fill identity fields if the row is missing them (never overwrite good data).
  if (!candidate.full_name && fields.name) update.full_name = fields.name;
  if (!candidate.email && fields.email) update.email = fields.email;
  if (!candidate.phone && fields.phone) update.phone = fields.phone;

  const { error: upErr } = await supabase.from("candidates").update(update).eq("id", candidateId);
  if (upErr) throw upErr;

  return {
    candidateId,
    ok: true,
    score: scored.score,
    tier: scored.tier,
    flags: scored.flags,
    usedAI: Boolean(ai),
  };
}

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(req.url);

    if (url.pathname.endsWith("/health")) {
      return jsonResponse({ ok: true, service: "intern-screen", openai: Boolean(ENV.OPENAI_API_KEY) });
    }

    if (req.method !== "POST") {
      return jsonResponse({ ok: true, message: "intern-screen online. POST { candidateIds, targetSkills? }" });
    }

    const payload = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(payload?.candidateIds)
      ? payload.candidateIds.map(String)
      : payload?.candidateId
      ? [String(payload.candidateId)]
      : [];
    const targetSkills: string[] = Array.isArray(payload?.targetSkills)
      ? payload.targetSkills.map((s: unknown) => String(s))
      : [];

    if (ids.length === 0) {
      return jsonResponse({ ok: false, error: "candidateIds is required" }, 400);
    }

    const supabase = getAdminClient();
    const results: Json[] = [];
    const errors: string[] = [];
    for (const id of ids) {
      try {
        results.push(await screenCandidate(supabase, id, targetSkills));
      } catch (err) {
        errors.push(`${id}: ${String(err)}`);
        results.push({ candidateId: id, ok: false, error: String(err) });
      }
    }

    const scored = results.filter((r: any) => r?.ok).length;
    return jsonResponse({ ok: true, screened: scored, total: ids.length, errors, results });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});

// Supabase Edge Function: intern-email-intake
// ADDITIVE, self-contained. Receives forwarded resume emails (via a Resend
// inbound "email.received" webhook), pulls every PDF attachment, uploads it,
// creates a candidate tagged batch "Email intake", and screens it with Gemini
// (which reads the PDF directly — no browser / no PDF library needed).
//
// Emailed resumes then appear in the existing Intern Screening queue, scored.
// Nothing here changes existing tables or the hr@ mailbox — it only consumes
// forwarded mail and inserts candidates.
//
// Set on the server (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY (already set), and optionally RESEND_WEBHOOK_SECRET.

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
  GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") ?? "",
  GEMINI_MODEL: Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest",
  RESEND_WEBHOOK_SECRET: Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "",
  INTAKE_BATCH: Deno.env.get("INTAKE_BATCH") ?? "Email intake",
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

function safeJson<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function sanitizeFileName(name: string): string {
  return (name || "resume.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

function nameFromFile(name: string): string {
  const base = (name || "")
    .replace(/\.(pdf|docx?)$/i, "")
    .replace(/^\d+[_-]?\d*[_-]?\d*[_-]?/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(resume|cv|curriculum|vitae)\b/gi, "")
    .trim();
  return base.length >= 2 ? base : (name || "Candidate").replace(/\.(pdf|docx?)$/i, "");
}

function internPrompt(): string {
  return `You are a precise resume parser for a college-intern hiring pipeline.
Read the attached resume PDF and return ONLY JSON with these keys:
{
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "skills": string[],
  "college": string | null,
  "degree": string | null,
  "branch": string | null,
  "graduation_year": number | null,
  "cgpa": number | null,
  "projects": string[],
  "certifications": string[],
  "coursework": string[],
  "experience_years": number
}
Do not invent data. Use null / [] when a field is absent.`;
}

function normalizeExtraction(parsed: Record<string, unknown>): InternExtraction {
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
}

// Gemini reads the PDF bytes directly (multimodal) — no server-side PDF lib.
async function geminiParsePdf(base64Pdf: string): Promise<InternExtraction | null> {
  if (!ENV.GEMINI_API_KEY) return null;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: "application/pdf", data: base64Pdf } },
        { text: internPrompt() },
      ],
    }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
  };
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": ENV.GEMINI_API_KEY },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
      const data = await resp.json();
      const jsonText: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
      const parsed = safeJson<Record<string, unknown>>(jsonText);
      if (!parsed) throw new Error("Invalid JSON from Gemini");
      return normalizeExtraction(parsed);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  console.warn("Gemini PDF parse failed after retries:", lastError);
  return null;
}

function normalizeCgpa(cgpa: number | null): number | null {
  if (cgpa == null || !Number.isFinite(cgpa)) return null;
  const c = Number(cgpa);
  if (c > 10) return Math.max(0, Math.min(1, c / 100));
  if (c > 4) return Math.max(0, Math.min(1, c / 10));
  return Math.max(0, Math.min(1, c / 4));
}

type Scored = { score: number; tier: string; rationale: string; flags: string[] };

function computeInternScore(fields: InternExtraction): Scored {
  const skills = normalizeSkills(fields.skills);
  const skillScore = Math.min(1, skills.length / 8);
  const projectCount = fields.projects?.length ?? 0;
  const projectScore = Math.min(1, projectCount / 3);
  const courseworkScore = fields.degree || fields.branch ? 0.65 : 0.35;
  const cgpaNorm = normalizeCgpa(fields.cgpa);
  const cgpaScore = cgpaNorm == null ? 0.4 : cgpaNorm;
  const certScore = Math.min(1, (fields.certifications?.length ?? 0) / 3);

  const score = Math.round(
    (skillScore * 0.45 + projectScore * 0.25 + courseworkScore * 0.15 + cgpaScore * 0.10 + certScore * 0.05) * 100,
  );
  const tier = score >= 75 ? "Top" : score >= 55 ? "Consider" : score >= 35 ? "Review" : "Low";

  const flags: string[] = [];
  if (fields.cgpa == null) flags.push("no_cgpa");
  if (projectCount === 0) flags.push("no_projects");
  if (skills.length === 0) flags.push("no_skills");
  if (!fields.email) flags.push("no_email");

  const bits: string[] = [`${skills.length} skills detected`, `${projectCount} project${projectCount === 1 ? "" : "s"}`];
  if (fields.cgpa != null) bits.push(`CGPA ${fields.cgpa}`);
  if (fields.branch) bits.push(fields.branch);
  return { score, tier, rationale: `${tier} — ${bits.join(" · ")}`, flags };
}

// ---- Attachment extraction from a Resend inbound webhook payload ----
type RawAttachment = { filename?: string; content?: string; content_type?: string; contentType?: string; url?: string };

function collectAttachments(payload: any): RawAttachment[] {
  const d = payload?.data ?? payload;
  const list = d?.attachments ?? payload?.attachments ?? [];
  return Array.isArray(list) ? list : [];
}

function isPdf(att: RawAttachment): boolean {
  const ct = (att.content_type ?? att.contentType ?? "").toLowerCase();
  const name = (att.filename ?? "").toLowerCase();
  return ct.includes("pdf") || name.endsWith(".pdf");
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function attachmentBytes(att: RawAttachment): Promise<Uint8Array | null> {
  try {
    if (att.content) return base64ToBytes(att.content);
    if (att.url) {
      const resp = await fetch(att.url);
      if (!resp.ok) return null;
      return new Uint8Array(await resp.arrayBuffer());
    }
  } catch (_err) {
    return null;
  }
  return null;
}

async function uploadResume(
  supabase: ReturnType<typeof getAdminClient>,
  bytes: Uint8Array,
  filename: string,
  index: number,
): Promise<string | null> {
  const key = `${Date.now()}_${index}_${sanitizeFileName(filename)}`;
  for (const bucket of ["resumes-private", "resumes"]) {
    const { error } = await supabase.storage.from(bucket).upload(key, bytes, {
      upsert: false,
      contentType: "application/pdf",
    });
    if (!error) return `${bucket}/${key}`;
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(req.url);
    if (url.pathname.endsWith("/health")) {
      return jsonResponse({ ok: true, service: "intern-email-intake", gemini: Boolean(ENV.GEMINI_API_KEY) });
    }
    if (req.method !== "POST") {
      return jsonResponse({ ok: true, message: "intern-email-intake online. POST a Resend inbound webhook." });
    }

    // Optional shared-secret check (same pattern as receive-email-reply).
    if (ENV.RESEND_WEBHOOK_SECRET) {
      const auth = req.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${ENV.RESEND_WEBHOOK_SECRET}`) {
        return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
      }
    }

    const payload = await req.json().catch(() => ({}));
    const data = (payload as any)?.data ?? payload;
    const fromEmail: string | null = (data?.from ?? null) && String(data.from).toLowerCase();
    const subject: string = data?.subject ?? "";

    const attachments = collectAttachments(payload).filter(isPdf);
    if (attachments.length === 0) {
      // Not an error — just nothing to screen (keeps Resend from retrying).
      return jsonResponse({ ok: true, screened: 0, note: "No PDF attachments in this email." });
    }

    const supabase = getAdminClient();
    const results: Json[] = [];
    let index = 0;
    for (const att of attachments) {
      index++;
      const filename = att.filename ?? `resume_${index}.pdf`;
      try {
        const bytes = await attachmentBytes(att);
        if (!bytes || bytes.length < 100) {
          results.push({ filename, ok: false, error: "empty attachment" });
          continue;
        }
        const resumeUrl = await uploadResume(supabase, bytes, filename, index);
        if (!resumeUrl) {
          results.push({ filename, ok: false, error: "upload failed" });
          continue;
        }

        // Parse + score with Gemini (reads the PDF directly).
        const fields = await geminiParsePdf(bytesToBase64(bytes));
        const scored = fields ? computeInternScore(fields) : null;

        const row: Record<string, unknown> = {
          full_name: fields?.name ?? nameFromFile(filename),
          email: fields?.email ?? (fromEmail || null),
          phone: fields?.phone ?? null,
          status: "Pending",
          resume_url: resumeUrl,
          resume_processed: Boolean(fields),
          reference_source: "Email",
          source_portal: "Email",
          batch_tag: ENV.INTAKE_BATCH,
        };
        if (fields) {
          row.skills = fields.skills;
          row.college = fields.college;
          row.degree = fields.degree;
          row.branch = fields.branch;
          row.graduation_year = fields.graduation_year;
          row.cgpa = fields.cgpa;
          row.projects = fields.projects;
          row.certifications = fields.certifications;
          row.experience_years = fields.experience_years;
          row.education = fields.education;
        }
        if (scored) {
          row.screening_score = scored.score;
          row.screening_tier = scored.tier;
          row.screening_rationale = scored.rationale;
          row.intern_flags = scored.flags;
          row.screened_at = new Date().toISOString();
        }

        const { data: inserted, error } = await supabase
          .from("candidates")
          .insert(row)
          .select("id")
          .single();
        if (error) throw error;

        results.push({
          filename,
          ok: true,
          candidateId: inserted?.id,
          score: scored?.score ?? null,
          tier: scored?.tier ?? null,
          screened: Boolean(fields),
        });
      } catch (err) {
        results.push({ filename, ok: false, error: String(err) });
      }
    }

    const screened = results.filter((r: any) => r?.ok).length;
    return jsonResponse({ ok: true, from: fromEmail, subject, screened, total: attachments.length, results });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});

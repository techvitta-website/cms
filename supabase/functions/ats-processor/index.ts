// Supabase Edge Function: ats-processor
// Purpose: Scan PDFs in storage bucket "resumes", extract text, parse candidate
// fields (name, email, phone, skills, education, experience_years), compare with jobs,
// and upsert into candidates/matches/resume_scores with logging and health/process endpoints.

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

type CandidateExtraction = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience_years: number;
  education: string | null;
  confidences?: { skills?: number; experience_years?: number; education?: number; identity?: number };
  raw_text_excerpt?: string;
};

type JobRow = {
  id: string;
  job_title: string;
  description: string | null;
  required_skills: string[] | null;
  experience_required: number | null;
};

const ENV = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY") ?? "",
  // Accept either RESUMES_BUCKET (recommended; no SUPABASE_ prefix) or legacy SUPABASE_RESUMES_BUCKET
  SUPABASE_RESUMES_BUCKET:
    Deno.env.get("RESUMES_BUCKET") ??
    Deno.env.get("SUPABASE_RESUMES_BUCKET") ??
    "resumes-private",
};

function candidateBuckets(...overrides: Array<string | null | undefined>): string[] {
  const buckets = new Set<string>();
  for (const value of overrides) {
    const trimmed = (value ?? "").trim();
    if (trimmed.length > 0) buckets.add(trimmed);
  }
  buckets.add(ENV.SUPABASE_RESUMES_BUCKET);
  buckets.add("resumes-private");
  buckets.add("resumes");
  return Array.from(buckets);
}

function getAdminClient() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function normalizeSkills(skills: string[] | null | undefined): string[] {
  const set = new Set<string>();
  for (const s of skills ?? []) {
    const v = String(s).trim().toLowerCase();
    if (v) set.add(v);
  }
  return Array.from(set);
}

async function hashBytesToHex(bytes: Uint8Array): Promise<string> {
  const baseBuffer =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const data = baseBuffer as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Robust candidate name extraction using resume text with safe fallbacks
function extractCandidateNameFromText(resumeText: string, email: string | null, fileName: string): string | null {
  const cleanLine = (s: string) =>
    s
      .replace(/\u00A0/g, " ")
      .replace(/\b([A-Za-z])\s*\.\s+(?=[A-Za-z])/g, "$1. ")
      .replace(/\b([A-Za-z])\s*\.(?=\s|$)/g, "$1.")
      .replace(/\s+/g, " ")
      .trim();
  const toTitle = (s: string) => s
    .split(/\s+/)
    .map((w) => {
      if (w.length === 0) return w;
      if (w.length === 1) return w.toUpperCase();
      if (w === w.toUpperCase() && w.length > 1) return w[0] + w.slice(1).toLowerCase();
      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
  const formatName = (s: string) => {
    const trimmed = cleanLine(s);
    const parts = trimmed.split(/\s+/).filter((w) => w.length > 0);
    if (parts.length === 0) return trimmed;
    const upperWords = parts.filter((w) => w.length > 1 && w === w.toUpperCase()).length;
    const titleWords = parts.filter((w) => /^[A-Z][a-z]+$/.test(w)).length;
    if (upperWords >= Math.ceil(parts.length * 0.6)) return trimmed;
    if (titleWords >= Math.ceil(parts.length * 0.6)) return trimmed;
    return toTitle(trimmed);
  };

  const stripLabelArtifacts = (value: string) => {
    let cleaned = value.replace(/[,|]/g, " ");
    cleaned = cleaned.replace(/\b(email|mail|mobile|phone|contact|tel|cell|linkedin|whatsapp)\b.*$/i, "");
    cleaned = cleaned.replace(/[:\-–—]\s*(email|mail|mobile|phone|contact|tel|cell|linkedin|whatsapp).*/i, "");
    cleaned = cleaned.replace(/^(email|mail|mobile|phone|contact|tel|cell|linkedin|whatsapp)\s*[:\-–—]?\s*/i, "");
    cleaned = cleaned.replace(/\s{2,}/g, " ");
    return cleaned.trim();
  };

  const sanitizeExtractedName = (value: string | null | undefined): string | null => {
    if (!value) return null;

    let working = stripLabelArtifacts(cleanLine(value));
    if (!working) return null;

    const headingWords = new Set([
      "mr",
      "mrs",
      "ms",
      "miss",
      "sir",
      "languages",
      "language",
      "known",
      "achievements",
      "certifications",
      "technical",
      "skills",
      "summary",
      "professional",
      "profile",
      "objective",
      "career",
      "about",
      "me",
      "details",
      "contact",
      "phone",
      "email",
      "address",
    ]);

    let tokens = working
      .replace(/[|,:;]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    while (tokens.length && headingWords.has(tokens[0].toLowerCase())) tokens.shift();
    while (tokens.length && headingWords.has(tokens[tokens.length - 1].toLowerCase())) tokens.pop();

    if (!tokens.length) return null;

    const cutIndex = tokens.findIndex(
      (token, index) => index >= 2 && (!/^[A-Za-z'.-]+$/.test(token) || token[0] === token[0].toLowerCase()),
    );
    if (cutIndex >= 2) {
      tokens = tokens.slice(0, cutIndex);
    }

    tokens = tokens.filter((token) => /^[A-Za-z'.-]+$/.test(token) && !headingWords.has(token.toLowerCase()));

    if (tokens.length > 4) tokens = tokens.slice(0, 4);

    if (tokens.length >= 2) return formatName(tokens.join(" "));
    if (tokens.length === 1 && tokens[0].length >= 3) return formatName(tokens[0]);

    return null;
  };

  // Common skill/tech words that should NEVER be in a name
  const skillWords = new Set([
    "react", "javascript", "typescript", "node", "java", "python", "sql", "html", "css",
    "angular", "vue", "express", "mongodb", "mysql", "postgres", "aws", "azure", "gcp",
    "docker", "kubernetes", "git", "github", "gitlab", "api", "rest", "graphql", "json",
    "xml", "http", "https", "tcp", "udp", "ssl", "tls", "oauth", "jwt", "redis", "kafka",
    "elasticsearch", "terraform", "ansible", "jenkins", "ci", "cd", "devops", "agile", "scrum",
    "flask", "django", "fastapi", "spring", "hibernate", "jpa", "maven", "gradle", "npm", "yarn",
    "webpack", "babel", "eslint", "prettier", "jest", "junit", "selenium", "cypress", "pytest",
    "numpy", "pandas", "tensorflow", "pytorch", "scikit", "keras", "opencv", "matplotlib",
    "bootstrap", "tailwind", "sass", "less", "stylus", "webpack", "vite", "next", "nuxt",
    "gatsby", "remix", "svelte", "solid", "alpine", "jquery", "lodash", "underscore", "rxjs",
    "redux", "mobx", "zustand", "recoil", "context", "hooks", "hoc", "hoc", "render", "props",
    "state", "component", "module", "package", "library", "framework", "architecture", "pattern",
    "algorithm", "data", "structure", "design", "system", "service", "microservice", "monolith",
    "serverless", "lambda", "function", "event", "stream", "queue", "message", "broker",
    "cache", "session", "cookie", "token", "auth", "authorization", "authentication", "security",
    "encryption", "hashing", "bcrypt", "argon", "jwt", "oauth2", "saml", "ldap", "rbac", "acl",
    "cloud", "edge", "lot", "mi", "ai", "ml", "iot", "saas", "paas", "iaas", "server", "client",
    "network", "protocol", "interface", "endpoint", "gateway", "proxy", "load", "balancer",
    "container", "image", "registry", "cluster", "node", "pod", "namespace", "deployment",
    "replica", "scale", "monitor", "log", "metric", "trace", "alert", "dashboard", "grafana",
    "prometheus", "kibana", "elastic", "splunk", "datadog", "newrelic", "sentry", "rollbar"
  ]);

  const looksLikeSkillList = (s: string): boolean => {
    const lower = s.toLowerCase();
    const words = lower.split(/[\s,;|]+/).filter((w) => w.length > 0);
    if (words.length < 3) return false;
    const skillMatches = words.filter((w) => skillWords.has(w.trim())).length;
    return skillMatches >= 2 || (skillMatches >= 1 && words.length >= 3);
  };

  const containsTechTerms = (s: string): boolean => {
    const lower = s.toLowerCase();
    const words = lower.split(/\s+/).filter((w) => w.length > 0);
    // Check if any word is a tech term
    if (words.some((w) => skillWords.has(w.trim()))) return true;
    // Check for common tech patterns
    const techPatterns = [
      /\b(cloud|edge|lot|mi|ai|ml|iot|saas|paas|iaas)\b/i,
      /\b(server|client|network|protocol|interface|endpoint)\b/i,
      /\b(container|image|registry|cluster|pod|namespace)\b/i,
      /\b(deployment|replica|scale|monitor|log|metric)\b/i
    ];
    return techPatterns.some((pattern) => pattern.test(s));
  };

  const isBad = (s: string) => {
    const lower = s.toLowerCase();
      const badKeywords = [
        "resume", "curriculum", "vitae", "cv", "email", "phone", "address", "objective", "summary",
        "professional summary", "experience", "education", "skills", "projects", "linkedin", "github", "portfolio",
        "achievement", "achievements", "certification", "certifications", "technical", "about me", "profile summary",
        "languages", "languages known",
      "years", "yrs", "work", "employment", "job", "position", "company", "university", "college",
      "degree", "bachelor", "master", "phd", "mba", "btech", "mtech", "skilled", "expert",
      "blockchain", "developer", "engineer", "programmer", "software", "technology", "computer",
      "science", "andhra", "pradesh", "karnataka", "tamil", "nadu", "maharashtra", "delhi",
      "mumbai", "bangalore", "hyderabad", "chennai", "pune", "kolkata", "india", "state",
      "district", "city", "location", "address", "pin", "code", "zip",
    "application", "key", "chat", "problem", "solving", "time", "communication", "unified",
      "peer", "web3", "based", "storage", "authentication", "encryption", "decentralized",
      "transmission", "webrtc", "ipfs", "bootstrap", "ganache", "remix", "eclipse", "visual",
    "studio", "tools", "front", "end", "back", "database", "collaboration", "adaptability",
    "career", "specialization", "profile", "learning", "great"
    ];
    return badKeywords.some((kw) => lower.includes(kw))
      || /^https?:\/\//.test(s)
      || /^\d+[\s\d-]*$/.test(s)
      || /@/.test(s)
      || /[.,;:!?\-]{2,}/.test(s)
      || /\b(section|heading|title|header|project|feature|technolog)\b/i.test(lower)
      || looksLikeSkillList(s)
      || containsTechTerms(s)
      || s.split(/[\s,]+/).some((w) => skillWords.has(w.toLowerCase().trim()));
  };
  const allLines = resumeText.split(/\r?\n/).map(cleanLine).filter((l) => l.length > 0);
  const lines = allLines.slice(0, 20);
  const labelPatterns = [
    /(?:^|\n)\s*(?:name|full\s+name|fullname|applicant\s+name|candidate\s+name)[:\-\s]+([A-Za-z][A-Za-z\s.'-]{2,100})/i,
    /(?:^|\n)\s*(?:name|full\s+name)[:\-\s]+([A-Za-z][A-Za-z\s.'-]{2,100})/i,
  ];
  for (const pattern of labelPatterns) {
    const m = resumeText.match(pattern)?.[1]?.trim();
    if (m) {
      const cleaned = cleanLine(m);
      if (cleaned.length >= 3 && cleaned.length <= 100 && !isBad(cleaned) && !/@/.test(cleaned)) {
        const sanitized = sanitizeExtractedName(cleaned);
        if (sanitized) return sanitized;
        return formatName(cleaned);
      }
    }
  }
  // CRITICAL: Check the absolute first line first (name is ALWAYS at the very top)
  if (lines.length > 0) {
    const firstLine = lines[0];
    // Reject if it contains ANY skill word, tech terms, or looks like a skill list
    if (looksLikeSkillList(firstLine) || containsTechTerms(firstLine) || firstLine.split(/[\s,]+/).some((w) => skillWords.has(w.toLowerCase().trim()))) {
      // Skip this line, it's skills/tech terms
    } else if (!isBad(firstLine) && firstLine.length >= 3 && firstLine.length <= 60) {
      const words = firstLine.split(/\s+/).filter((w) => w.length > 0);
      if (words.length >= 2 && words.length <= 4) {
        const allAlpha = words.every((w) => /^[A-Za-z'.-]+$/.test(w));
        if (allAlpha) {
          // Triple check: no word should be a skill or tech term
          const hasSkillWord = words.some((w) => skillWords.has(w.toLowerCase().trim()));
          const hasTechTerm = containsTechTerms(firstLine);
          if (!hasSkillWord && !hasTechTerm) {
            const capitalCount = words.filter((w) => /^[A-Z]/.test(w)).length;
            const allCapsCount = words.filter((w) => w === w.toUpperCase() && w.length > 1).length;
            const capitalRatio = capitalCount / words.length;
            const isAllCaps = allCapsCount === words.length && words.length >= 2;
            if ((capitalRatio >= 0.7 || isAllCaps) && !/\d{2,}/.test(firstLine) && !isBad(firstLine)) {
              const sanitized = sanitizeExtractedName(firstLine);
              if (sanitized) return sanitized;
              return formatName(firstLine);
            }
          }
        }
      }
    }
  }
  // Check lines 2-3 with strict criteria
  for (let i = 1; i < Math.min(3, lines.length); i++) {
    const line = lines[i];
    if (isBad(line) || line.length < 3 || line.length > 80) continue;
    const words = line.split(/\s+/).filter((w) => w.length > 0);
    if (words.length < 2 || words.length > 4) continue;
    const allAlpha = words.every((w) => /^[A-Za-z'.-]+$/.test(w));
    if (!allAlpha) continue;
    const capitalCount = words.filter((w) => /^[A-Z]/.test(w)).length;
    const allCapsCount = words.filter((w) => w === w.toUpperCase() && w.length > 1).length;
    const capitalRatio = capitalCount / words.length;
    const isAllCaps = allCapsCount === words.length && words.length >= 2;
    if ((capitalRatio >= 0.9 || isAllCaps) && !/\d{2,}/.test(line) && !isBad(line)) {
      const sanitized = sanitizeExtractedName(line);
      if (sanitized) return sanitized;
      return formatName(line);
    }
  }
  // Check lines 4-10 with slightly relaxed criteria
  for (let i = 3; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    if (isBad(line) || line.length < 3 || line.length > 100) continue;
    const words = line.split(/\s+/).filter((w) => w.length > 0);
    if (words.length < 2 || words.length > 6) continue;
    const allAlpha = words.every((w) => /^[A-Za-z'.-]+$/.test(w));
    if (!allAlpha) continue;
    const capitalCount = words.filter((w) => /^[A-Z]/.test(w)).length;
    const allCapsCount = words.filter((w) => w === w.toUpperCase() && w.length > 1).length;
    const capitalRatio = capitalCount / words.length;
    const isAllCaps = allCapsCount === words.length && words.length >= 2;
    if ((capitalRatio >= 0.7 || isAllCaps) && !/\d{2,}/.test(line)) {
      const lower = line.toLowerCase();
      if (!isBad(line)) {
        const sanitized = sanitizeExtractedName(line);
        if (sanitized) return sanitized;
        return formatName(line);
      }
    }
  }
  for (let i = 0; i < Math.min(6, lines.length - 1); i++) {
    const collected: string[] = [];
    for (let j = i; j < Math.min(lines.length, i + 5); j++) {
    const fragment = lines[j];
      if (isBad(fragment) || fragment.length < 2 || fragment.length > 30) break;
    if (/^[.\-]+$/.test(fragment.trim())) break;
    const tokens = fragment
      .split(/\s+/)
      .filter((w) => w.length > 0 && !/^[.\-]+$/.test(w));
    if (tokens.length !== 1) break;
      const token = tokens[0];
      if (!/^[A-Za-z'.-]+$/.test(token)) break;
      collected.push(token);
    }
    if (collected.length >= 2) {
      const combined = collected.join(" ");
      const sanitized = sanitizeExtractedName(combined);
      if (sanitized) return sanitized;
      return formatName(combined);
    }
  }
  // Only scan first 5 lines for multi-word patterns (name is at top)
  const firstBlock = lines.slice(0, 5).join(" ");
  const multiWordRx = /\b([A-Z][A-Za-z'.-]{1,})(?:\s+[A-Z][A-Za-z'.-]{1,}){1,3}\b/g;
  for (const match of firstBlock.matchAll(multiWordRx)) {
    const candidate = match[0].trim();
    if (isBad(candidate) || candidate.length > 60) continue;
    const words = candidate.split(/\s+/).filter((w) => w.length > 0);
    if (words.length < 2 || words.length > 4) continue; // Names are 2-4 words
    if (words.some((w) => w.length < 2)) continue;
    if (words.some((w) => /[.,;:!?\-]{2,}/.test(w))) continue; // Reject if has punctuation clusters
    if (isBad(candidate)) continue; // Double check with isBad
    const sanitized = sanitizeExtractedName(candidate);
    if (sanitized) return sanitized;
    return formatName(candidate);
  }
  if (email) {
    const prefix = email.split("@")[0];
    const parts = prefix.split(/[._-]+/).filter((p) => p.length >= 2 && /^[a-z]+$/i.test(p));
    if (parts.length >= 2 && parts.length <= 3) {
      const combined = parts.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(" ");
      const sanitized = sanitizeExtractedName(combined);
      if (sanitized) return sanitized;
      return combined;
    }
  }
  const fallback = fileName
    .replace(/\.(pdf|docx)$/i, "")
    .replace(/^\d+_\d+_\d*_?/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(resume|cv|curriculum|vitae|_)\b/gi, "")
    .trim();
  if (fallback && fallback.length >= 2) {
    const sanitized = sanitizeExtractedName(fallback);
    if (sanitized) return sanitized;
    return toTitle(fallback);
  }
  return null;
}

async function bucketExists(supabase: ReturnType<typeof createClient>, bucket: string): Promise<boolean> {
  if (!bucket) return false;
  const { data, error } = await supabase.storage.listBuckets();
  if (error) return false;
  return (data ?? []).some((b) => b.name === bucket);
}

// Extract PDF text from bytes without worker in Edge
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
    // naive fallback
    try {
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const decoded = decoder.decode(bytes);
      return decoded.replace(/\x00/g, "").slice(0, 200000);
    } catch {
      throw _err;
    }
  }
}

async function safeJson<T = unknown>(text: string): Promise<T | null> {
  try { return JSON.parse(text) as T; } catch { return null; }
}

function localHeuristicExtract(resumeText: string): CandidateExtraction {
  const lower = resumeText.toLowerCase();
  const firstLine = (resumeText.split(/\r?\n/).map(s => s.trim()).find(s => s.length > 0) ?? "").slice(0, 60);
  const emailMatch = resumeText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  const email = emailMatch?.[0]?.toLowerCase() ?? null;
  const phoneMatch = resumeText.match(/(\+?\d[\d\s().-]{7,}\d)/g);
  const phoneRaw = phoneMatch?.[0] ?? null;
  const phone = phoneRaw ? phoneRaw.replace(/[^+\d]/g, "") : null;
  const common = ["javascript","typescript","react","node","python","java","sql","aws","docker","kubernetes","graphql","html","css","tailwind","next.js","vite","supabase","postgres","deno","gcp","azure","ml","ai","pandas","numpy","tensorflow","pytorch"];
  const found = common.filter(k => lower.includes(k)).map(s => s.toLowerCase());
  const expMatch = lower.match(/(\d{1,2})\s*(\+)?\s*(years|yrs|year)\s*(of)?\s*(experience)?/);
  const experience_years = expMatch ? Math.min(40, parseInt(expMatch[1])) : 0;
  const eduMatch = resumeText.match(/(Bachelor|Master|B\.Tech|BTech|MCA|MBA|BSc|MSc|PhD)[^\n]{0,80}/i);
  const education = eduMatch ? eduMatch[0] : null;
  const derivedName = extractCandidateNameFromText(resumeText, email, "");
  return {
    name: derivedName || (firstLine || null),
    email,
    phone,
    skills: normalizeSkills(found),
    experience_years,
    education,
    confidences: { identity: email ? 0.9 : 0.4, skills: found.length > 0 ? 0.7 : 0.3 },
    raw_text_excerpt: resumeText.slice(0, 1200),
  };
}

async function callOpenAIExtract(resumeText: string): Promise<CandidateExtraction | null> {
  if (!ENV.OPENAI_API_KEY) return null;
  const sys = "You are a precise resume parser. Return STRICT JSON only with validated fields.";
  const user = `Extract from the resume text the following fields with best-effort normalization.
Return ONLY JSON with keys:
{
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "skills": string[],
  "education": string | null,
  "experience_years": number,
  "confidences": { "identity"?: number, "skills"?: number, "education"?: number, "experience_years"?: number }
}

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
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${ENV.OPENAI_API_KEY}` };
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers, body: JSON.stringify(body) });
      if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
      const data = await resp.json();
      const jsonText: string = data.choices?.[0]?.message?.content ?? "";
      const parsed = await safeJson<CandidateExtraction>(jsonText);
      if (!parsed) throw new Error("Invalid JSON from model");
      return {
        name: parsed.name ?? null,
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        skills: normalizeSkills(parsed.skills ?? []),
        experience_years: Math.max(0, Math.min(50, Number(parsed.experience_years ?? 0))) || 0,
        education: parsed.education ?? null,
        confidences: parsed.confidences,
        raw_text_excerpt: resumeText.slice(0, 1200),
      };
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  console.warn("OpenAI extraction failed after retries:", lastError);
  return null;
}

function computeMatchScore(candidate: CandidateExtraction, job: JobRow): { score: number; commonSkills: string[] } {
  const jobSkills = normalizeSkills(job.required_skills ?? []);
  const candSkills = normalizeSkills(candidate.skills);
  let skillComponent = 0;
  let commonSkills: string[] = [];
  if (jobSkills.length > 0) {
    commonSkills = candSkills.filter((s) => jobSkills.includes(s));
    skillComponent = (commonSkills.length / jobSkills.length) * 70; // 70% skills
  } else {
    const desc = (job.description ?? "").toLowerCase();
    const matched = candSkills.filter((s) => desc.includes(s));
    const denom = Math.max(1, Math.min(10, candSkills.length));
    skillComponent = (matched.length / denom) * 70;
  }
  const expReq = Math.max(0, Number(job.experience_required ?? 0));
  const expRatio = expReq > 0 ? Math.min(candidate.experience_years / expReq, 1) : 1;
  const experienceComponent = expRatio * 30; // 30% experience
  const score = Math.round(skillComponent + experienceComponent);
  return { score: Math.max(0, Math.min(100, score)), commonSkills };
}

async function logActivity(supabase: ReturnType<typeof createClient>, entry: { level: "info"|"warn"|"error"; action: string; details?: Json; }) {
  await supabase.from("activity_logs").insert({
    level: entry.level,
    action: entry.action,
    details: entry.details ?? null,
  });
}

async function upsertCandidateAndMatches(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  fileName: string,
  resumeText: string,
  extraction: CandidateExtraction,
  options: { resumeHash?: string } = {},
): Promise<{ candidateId: string; topMatches: Array<{ job_title: string; score: number }>; bestScore: number }> {
  const resumePath = `${bucket}/${fileName}`;
  const fallbackEmail = `noemail+${Date.now()}@example.com`;
  let candidateId: string | null = null;
  const resumeHash = options.resumeHash ?? null;

  const { data: existing } = await supabase
    .from("candidates")
    .select("id, resume_url")
    .or(
      [
        `resume_url.eq.${resumePath}`,
        `resume_url.eq.${fileName}`,
        resumeHash ? `resume_hash.eq.${resumeHash}` : "",
      ]
        .filter(Boolean)
        .join(","),
    )
    .limit(1)
    .maybeSingle();

  const update = {
    full_name: extraction.name ?? null,
    resume_url: resumePath,
    resume_text: resumeText.slice(0, 50000),
    skills: extraction.skills,
    experience_years: extraction.experience_years,
    education: extraction.education,
    phone: extraction.phone ?? null,
    email: extraction.email ?? null,
    resume_processed: true,
    ...(resumeHash ? { resume_hash: resumeHash } : {}),
  } as Record<string, Json>;

  if (existing?.id) {
    candidateId = existing.id;
    await supabase.from("candidates").update(update).eq("id", candidateId);
  } else {
    const preferredEmail = extraction.email ?? fallbackEmail;
    const insertPayload = {
      full_name: extraction.name ?? "Unknown",
      email: preferredEmail,
      ...update,
    } as Record<string, Json>;
    const { data: inserted, error } = await supabase
      .from("candidates")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error) {
      const dup = String(error.message || "").toLowerCase();
      if (dup.includes("duplicate") || dup.includes("unique")) {
        const { data: byEmail } = await supabase.from("candidates").select("id").eq("email", preferredEmail).maybeSingle();
        if (byEmail?.id) {
          candidateId = byEmail.id;
          await supabase.from("candidates").update(update).eq("id", candidateId);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    } else {
      candidateId = inserted!.id as string;
    }
  }

  const { data: jobs, error: jobsErr } = await supabase.from("jobs").select("id, job_title, description, required_skills, experience_required");
  if (jobsErr) throw jobsErr;
  const topMatches: Array<{ job_title: string; score: number }> = [];

  for (const job of (jobs as JobRow[]) ?? []) {
    const { score } = computeMatchScore(extraction, job);
    await supabase.from("matches").delete().eq("candidate_id", candidateId).eq("job_id", job.id);
    await supabase.from("matches").insert({
      candidate_id: candidateId,
      job_id: job.id,
      match_score: score,
      remarks: `Auto-matched via ats-processor.`,
    });
    topMatches.push({ job_title: job.job_title, score });
  }

  topMatches.sort((a, b) => b.score - a.score);
  const bestScore = topMatches[0]?.score ?? 0;

  await supabase.from("resume_scores").upsert({
    file_name: fileName,
    name: extraction.name ?? "Unknown",
    skills: extraction.skills,
    score: bestScore,
    ...(resumeHash ? { file_hash: resumeHash } : {}),
  }, { onConflict: "file_name" });

  if (!candidateId) {
    throw new Error("Failed to resolve candidateId after upsert");
  }

  return { candidateId, topMatches: topMatches.slice(0, 5), bestScore };
}

async function processOneFile(supabase: ReturnType<typeof createClient>, bucket: string, fileName: string) {
  if (!/\.pdf$/i.test(fileName)) return null;
  const { data: file, error: dlErr } = await supabase.storage.from(bucket).download(fileName);
  if (dlErr || !file) throw new Error(`Download failed for ${bucket}/${fileName}: ${dlErr?.message}`);
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const resumeHash = await hashBytesToHex(bytes);
  let text = "";
  try {
    text = await extractPdfTextFromBytes(bytes);
  } catch (err) {
    await logActivity(supabase, { level: "error", action: "pdf_extract_failed", details: { bucket, fileName, error: String(err) } });
    throw err;
  }
  const ai = await callOpenAIExtract(text);
  let extracted = ai ?? localHeuristicExtract(text);
  const betterName = extractCandidateNameFromText(text, extracted.email, fileName);
  if (betterName) extracted = { ...extracted, name: betterName };
  const result = await upsertCandidateAndMatches(supabase, bucket, fileName, text, extracted, {
    resumeHash,
  });
  await logActivity(supabase, { level: "info", action: "processed_resume", details: { bucket, fileName, result } });
  return result;
}

async function listUnprocessedFiles(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  opts: { force?: boolean } = {},
): Promise<string[]> {
  const { data: files, error } = await supabase.storage.from(bucket).list(undefined, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw error;
  const names = (files ?? []).map(f => f.name).filter(n => /\.pdf$/i.test(n));
  if (opts.force) return names;
  const { data: scores } = await supabase.from("resume_scores").select("file_name").in("file_name", names);
  const done = new Set((scores ?? []).map((r: { file_name: string }) => r.file_name));
  return names.filter(n => !done.has(n));
}

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(req.url);
    const supabase = getAdminClient();
    const defaultBucket = ENV.SUPABASE_RESUMES_BUCKET; // configurable bucket

    if (url.pathname.endsWith("/health")) {
      const usableBuckets = candidateBuckets(url.searchParams.get("bucket") ?? undefined);
      for (const bucket of usableBuckets) {
        if (await bucketExists(supabase, bucket)) {
          const unprocessed = await listUnprocessedFiles(supabase, bucket).catch(() => []);
          return jsonResponse({ ok: true, bucketExists: true, bucket, unprocessedCount: unprocessed.length });
        }
      }
      return jsonResponse({ ok: false, bucketExists: false, bucket: usableBuckets[0] ?? defaultBucket, unprocessedCount: 0 });
    }

    if (url.pathname.endsWith("/process-unprocessed") && req.method === "POST") {
      const payload = await req.json().catch(() => ({}));
      const force = Boolean(payload?.force);
      const requestedBuckets = Array.isArray(payload?.buckets)
        ? payload.buckets
        : [payload?.bucket ?? null];
      const bucketsToCheck = candidateBuckets(...requestedBuckets);
      const results: Array<Json> = [];
      const errors: Array<string> = [];

      for (const bucket of bucketsToCheck) {
        if (!(await bucketExists(supabase, bucket))) {
          continue;
        }
        const files = await listUnprocessedFiles(supabase, bucket, { force });
        for (const name of files) {
          let lastErr: unknown;
          for (let i = 0; i < 3; i++) {
            try {
              const r = await processOneFile(supabase, bucket, name);
              if (r) results.push({ bucket, file: name, r });
              lastErr = undefined;
              break;
            } catch (err) {
              lastErr = err;
              await new Promise((res) => setTimeout(res, 300 * (i + 1)));
            }
          }
          if (lastErr) {
            errors.push(`${bucket}/${name}: ${String(lastErr)}`);
            await logActivity(supabase, {
              level: "error",
              action: "process_failed",
              details: { bucket, name, error: String(lastErr) },
            });
          }
        }
      }

      return jsonResponse({ processed_count: results.length, errors, force, buckets: bucketsToCheck });
    }

    if (url.pathname.endsWith("/event") && req.method === "POST") {
      const payload = await req.json().catch(() => ({}));
      const nameRaw = payload?.record?.name ?? payload?.name ?? null;
      const bucketHint =
        payload?.record?.bucketId ??
        payload?.record?.bucket_id ??
        payload?.bucket ??
        payload?.bucketId ??
        payload?.bucket_id ??
        null;
      if (!nameRaw || typeof nameRaw !== "string") {
        return jsonResponse({ ok: false, error: "Missing filename" }, 400);
      }
      const name = nameRaw;
      let result: Awaited<ReturnType<typeof processOneFile>> = null;
      for (const bucket of candidateBuckets(bucketHint)) {
        if (!(await bucketExists(supabase, bucket))) continue;
        try {
          result = await processOneFile(supabase, bucket, name);
          if (result) {
            return jsonResponse({ ok: true, bucket, result });
          }
        } catch (err) {
          await logActivity(supabase, {
            level: "warn",
            action: "event_process_failed",
            details: { bucket, name, error: String(err) },
          });
        }
      }
      return jsonResponse({ ok: false, error: "File processing failed or bucket missing", name }, 404);
      return jsonResponse({ ok: true, result });
    }

    return jsonResponse({ ok: true, message: "ats-processor online", bucket: defaultBucket });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});



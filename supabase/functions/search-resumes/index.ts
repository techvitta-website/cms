// Supabase Edge Function: search-resumes
// Purpose: No-OpenAI skill search over PDFs in Supabase Storage.
// - POST /search-resumes  { skills: string[], bucket?: string }
//   → [{ bucket, file, name, email, phone, matchedSkills }]

import "jsr:@supabase/functions-js/edge-runtime-polyfills";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
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
  RESUMES_BUCKET: Deno.env.get("RESUMES_BUCKET") ?? Deno.env.get("SUPABASE_RESUIDMES_BUCKET") ?? Deno.env.get("SUPABASE_RESUMES_BUCKET") ?? "resumes-private",
};

function admin() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function extractPdfTextFromBytes(bytes: Uint8Array): Promise<string> {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = undefined;
    const loadingTask = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((it: { str: string }) => it.str).join(" ");
      text += pageText + "\n";
    }
    return text.trim();
  } catch (e) {
    // fallback: best effort decode
    try {
      const dec = new TextDecoder("utf-8", { fatal: false });
      return dec.decode(bytes).replace(/\x00/g, " ");
    } catch {
      throw e;
    }
  }
}

// Robust name extraction similar to ats-processor
function extractCandidateNameFromText(resumeText: string, email: string | null, fileName: string): string {
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
    if (words.some((w) => skillWords.has(w.trim()))) return true;
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
  return fileName;
}

// basic skill dictionary for extraction
const SKILL_DICT = [
  "react","react.js","reactjs","next","next.js","vue","angular","svelte",
  "javascript","typescript","node","node.js","express","nest","nest.js",
  "java","spring","spring boot","kotlin","python","django","flask","fastapi",
  ".net","dotnet","c#","c++","go","golang","rust",
  "sql","postgres","mysql","mariadb","sqlite","mongodb","redis",
  "aws","azure","gcp","docker","kubernetes","k8s","terraform","ansible",
  "html","css","sass","scss","tailwind","graphql","rest","grpc",
  "kafka","rabbitmq","spark","hadoop","hive","airflow",
  "pandas","numpy","scikit-learn","tensorflow","pytorch","ml","ai"
];

function detectSkills(text: string): string[] {
  const t = text.toLowerCase();
  const set = new Set<string>();
  for (const raw of SKILL_DICT) {
    const token = raw.toLowerCase();
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i');
    if (re.test(t)) set.add(token);
  }
  // simple alias propagation
  if (set.has('react') || set.has('react.js') || set.has('reactjs')) set.add('javascript');
  if (set.has('node') || set.has('node.js')) set.add('javascript');
  if (set.has('dotnet')) { set.add('.net'); set.add('c#'); }
  return Array.from(set);
}

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

async function handleSearch(req: Request) {
  const supabase = admin();
  const payload = await req.json().catch(() => ({}));
  let skills: string[] = Array.isArray(payload?.skills) ? payload.skills : [];
  const bucket: string = (payload?.bucket as string) || ENV.RESUMES_BUCKET;

  skills = skills.map((s) => String(s || "").toLowerCase().trim()).filter(Boolean);
  if (skills.length === 0) return json({ ok: false, error: "Provide skills: string[]" }, 400);

  const { data: files, error } = await supabase.storage.from(bucket).list(undefined, { limit: 1000 });
  if (error) return json({ ok: false, error: `List failed: ${error.message}` }, 400);

  const results: Array<Record<string, unknown>> = [];
  for (const f of files ?? []) {
    if (!/\.pdf$/i.test(f.name)) continue;
    try {
      const dl = await supabase.storage.from(bucket).download(f.name);
      if (dl.error || !dl.data) continue;
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const text = await extractPdfTextFromBytes(bytes);
      const lower = text.toLowerCase();
      const allSkills = detectSkills(text);
      const matched = skills.filter((s) => lower.includes(s));
      if (matched.length === 0) continue;
      const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null);
      const phoneRaw = (text.match(/(\+?\d[\d\s().-]{7,}\d)/g)?.[0] || null);
      const phone = phoneRaw ? phoneRaw.replace(/[^+\d]/g, "") : null;
      const name = extractCandidateNameFromText(text, email, f.name);
      results.push({ bucket, file: f.name, name, email, phone, skills: allSkills, matchedSkills: matched });
      if (results.length >= 500) break; // safety cap
    } catch (_e) {
      // ignore file errors
    }
  }
  return json({ ok: true, count: results.length, results });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const url = new URL(req.url);
  if (url.pathname.endsWith("/health")) return json({ ok: true, bucket: ENV.RESUMES_BUCKET });
  return await handleSearch(req);
});



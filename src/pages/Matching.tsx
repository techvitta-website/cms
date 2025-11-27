import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, GraduationCap, Briefcase, Eye, Download, CheckCircle, XCircle, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { extractTextFromPDFUrl, extractTextFromSupabaseStorage } from "@/lib/pdfExtractor";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExtractedResumeData {
  skills: string[];
  education: string;
  experience: number;
  fullText: string;
}

interface MatchResult {
  score: number;
  explanation: string;
  extractedData: ExtractedResumeData;
}

type LocalResult = {
  name: string;
  email: string | null;
  phone: string | null;
  skills: string[];
  matched: string[];
  source: string;
  candidateId?: string | null;
};

interface CandidateRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  resume_url: string | null;
  skills: string[] | null;
}

const normalizeResumePath = (path: string | null | undefined): string => {
  if (!path) return "";
  let normalized = path.trim();
  normalized = normalized.replace(/^https?:\/\/[^\/]+\//i, "");
  normalized = normalized.replace(/^storage\/v1\/object\//i, "");
  normalized = normalized.replace(/^public\//i, "");
  normalized = normalized.replace(/^sign\/[^\/]+\//i, "");
  normalized = normalized.replace(/^download\//i, "");
  normalized = normalized.replace(/^\//, "");
  return normalized;
};

const buildResumeKeyVariants = (path: string): string[] => {
  const keys = new Set<string>();
  const addKey = (value?: string | null) => {
    if (!value) return;
    keys.add(value.toLowerCase());
  };
  addKey(path);
  const normalized = normalizeResumePath(path);
  addKey(normalized);
  if (normalized) {
    const filename = normalized.split("/").pop();
    if (filename) {
      const lowerFile = filename.toLowerCase();
      addKey(lowerFile);
      addKey(`resumes/${lowerFile}`);
      addKey(`resumes-private/${lowerFile}`);
    }
  }
  return Array.from(keys);
};

const ALL_JOBS_OPTION = "__ALL_JOBS__";
const HIDDEN_JOBS_STORAGE_KEY = "cms-hidden-jobs";

export default function Matching() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState("");
  const [showResults, setShowResults] = useState(false);
  const { toast } = useToast();
  const [localPending, setLocalPending] = useState(false);
  const [localResults, setLocalResults] = useState<LocalResult[]>([]);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingResultIndex, setEditingResultIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    skills: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadHiddenJobs = () => {
      try {
        if (typeof window === "undefined") return;
        const stored = window.localStorage.getItem(HIDDEN_JOBS_STORAGE_KEY);
        if (!stored) {
          setHiddenJobIds(new Set());
          return;
        }
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHiddenJobIds(new Set(parsed.map(String)));
        } else {
          setHiddenJobIds(new Set());
        }
      } catch (error) {
        console.warn("Failed to load hidden jobs for Matching page", error);
        setHiddenJobIds(new Set());
      }
    };

    loadHiddenJobs();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === HIDDEN_JOBS_STORAGE_KEY) {
        loadHiddenJobs();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Fetch all jobs
  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const visibleJobs = useMemo(
    () => jobs.filter((job) => !hiddenJobIds.has(String(job.id))),
    [jobs, hiddenJobIds]
  );

  const isAllJobsSelection = selectedJob === ALL_JOBS_OPTION;
  const selectedJobDetails = isAllJobsSelection
    ? undefined
    : visibleJobs.find((job) => job.id === selectedJob);
  const requiredSkillCount = Array.isArray(selectedJobDetails?.required_skills)
    ? selectedJobDetails.required_skills.length
    : 0;
  const minMatchesRequired =
    requiredSkillCount && requiredSkillCount > 0
      ? Math.min(3, Math.max(1, requiredSkillCount))
      : null;

  // Fetch matches for selected job
  const { data: matches = [] } = useQuery({
    queryKey: ['matches', selectedJob],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *, 
          candidates (
            full_name,
            skills,
            education,
            experience_years,
            resume_url,
            status
          ),
          jobs (
            job_title
          )
        `)
        .eq('job_id', selectedJob)
        .order('match_score', { ascending: false });
      
      if (error) throw error;
      
      return (data || [])
        .filter((m: any) => {
          const status = m.candidates?.status;
          return typeof status !== "string" || status.toLowerCase() !== "shortlisted";
        })
        .map((m: any) => ({
        id: m.id,
        name: m.candidates?.full_name || 'Unknown',
        skills: m.candidates?.skills?.join(', ') || 'N/A',
        education: m.candidates?.education || 'N/A',
        experience: m.candidates?.experience_years || 0,
        score: m.match_score || 0,
        remarks: m.remarks || 'No remarks',
      }));
    },
    enabled: false,
  });

  /**
   * Comprehensive extraction of skills, education, and experience from resume text using OpenAI
   */
  // Global dictionary for better recall
  const SKILL_DICT = [
    'javascript','typescript','react','redux','next.js','vite','vue','nuxt','angular','rxjs',
    'node','express','nest','nestjs','fastify','deno','bun',
    'html','css','sass','scss','tailwind','bootstrap','styled-components',
    'java','spring','spring boot','kotlin','scala',
    'python','django','flask','fastapi','pandas','numpy','scikit-learn','ml','ai','nlp',
    'tensorflow','pytorch','keras','xgboost',
    'c#','dotnet','.net','go','golang','php','laravel','ruby','rails',
    'android','ios','swift','objective-c','react native','flutter',
    'sql','postgres','postgresql','mysql','mariadb','sqlite','mongodb','redis','elasticsearch','kafka','rabbitmq',
    'graphql','rest','grpc','websocket',
    'docker','kubernetes','helm','terraform','ansible','jenkins','github actions','gitlab ci','ci/cd',
    'aws','gcp','azure','supabase','firebase','vercel','netlify',
    'spark','hadoop','hive','airflow','dbt','snowflake','bigquery','redshift'
  ];

  const extractSkillsFromText = (text: string): string[] => {
    const lower = text.toLowerCase();
    const set = new Set<string>();
    for (const raw of SKILL_DICT) {
      const key = raw.toLowerCase();
      // word-boundary match to avoid false positives
      const pattern = new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
      if (pattern.test(lower)) set.add(key);
    }
    return Array.from(set);
  };

  // Extract candidate name from resume text - AGGRESSIVE extraction to get full name
  const extractCandidateName = (text: string, email: string | null, fileName: string): string => {
    const cleanLine = (s: string) =>
      s
        .replace(/\u00A0/g, " ")
        .replace(/\b([A-Za-z])\s*\.\s+(?=[A-Za-z])/g, "$1. ")
        .replace(/\b([A-Za-z])\s*\.(?=\s|$)/g, "$1.")
        .replace(/\s+/g, " ")
        .trim();
    const toTitle = (s: string) => {
      const words = s.split(/\s+/);
      return words.map(w => {
        if (w.length === 0) return w;
        if (w.length === 1) return w.toUpperCase();
        // Handle all caps
        if (w === w.toUpperCase() && w.length > 1) {
          return w[0] + w.slice(1).toLowerCase();
        }
        return w[0].toUpperCase() + w.slice(1).toLowerCase();
      }).join(' ');
    };
    const formatName = (s: string) => {
      const trimmed = cleanLine(s);
      const parts = trimmed.split(/\s+/).filter(w => w.length > 0);
      if (parts.length === 0) return trimmed;
      const upperWords = parts.filter(w => w.length > 1 && w === w.toUpperCase()).length;
      const titleWords = parts.filter(w => /^[A-Z][a-z]+$/.test(w)).length;
      if (upperWords >= Math.ceil(parts.length * 0.6)) return trimmed;
      if (titleWords >= Math.ceil(parts.length * 0.6)) return trimmed;
      return toTitle(trimmed);
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
      "redux", "mobx", "zustand", "recoil", "context", "hooks", "hoc", "render", "props",
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

    // Bad keywords that indicate it's NOT a name
    const isBad = (s: string) => {
      const lower = s.toLowerCase();
      const badKeywords = [
        "resume", "curriculum", "vitae", "cv", "email", "phone", "address", "objective", "summary",
        "experience", "education", "skills", "projects", "linkedin", "github", "portfolio",
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
      return badKeywords.some((kw) => lower.includes(kw)) ||
             /^https?:\/\//.test(s) ||
             /^\d+[\s\d-]*$/.test(s) ||
             /@/.test(s) ||
             /[.,;:!?\-]{2,}/.test(s) ||
             /\b(section|heading|title|header|project|feature|technolog)\b/i.test(lower) ||
             looksLikeSkillList(s) ||
             containsTechTerms(s) ||
             s.split(/[\s,]+/).some((w) => skillWords.has(w.toLowerCase().trim()));
    };

    // Split into lines and clean
    const allLines = text.split(/\r?\n/).map(cleanLine).filter(l => l.length > 0);
    const lines = allLines.slice(0, 20); // Check first 20 lines

    // 1) Explicit label patterns (Name:, Full Name:, etc.)
    const labelPatterns = [
      /(?:^|\n)\s*(?:name|full\s+name|fullname|applicant\s+name|candidate\s+name)[:\-\s]+([A-Za-z][A-Za-z\s.'-]{2,100})/i,
      /(?:^|\n)\s*(?:name|full\s+name)[:\-\s]+([A-Za-z][A-Za-z\s.'-]{2,100})/i,
    ];
    for (const pattern of labelPatterns) {
      const match = text.match(pattern)?.[1]?.trim();
      if (match) {
        const cleaned = cleanLine(match);
        if (cleaned.length >= 3 && cleaned.length <= 100 && !isBad(cleaned) && !/@/.test(cleaned)) {
          console.log('✅ Found name via label pattern:', cleaned);
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
        const words = firstLine.split(/\s+/).filter(w => w.length > 0);
        if (words.length >= 2 && words.length <= 4) {
          const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
          if (allAlpha) {
            // Triple check: no word should be a skill or tech term
            const hasSkillWord = words.some((w) => skillWords.has(w.toLowerCase().trim()));
            const hasTechTerm = containsTechTerms(firstLine);
            if (!hasSkillWord && !hasTechTerm) {
              const capitalCount = words.filter(w => /^[A-Z]/.test(w)).length;
              const allCapsCount = words.filter(w => w === w.toUpperCase() && w.length > 1).length;
              const capitalRatio = capitalCount / words.length;
              const isAllCaps = allCapsCount === words.length && words.length >= 2;
              if ((capitalRatio >= 0.7 || isAllCaps) && !/\d{2,}/.test(firstLine) && !isBad(firstLine)) {
                const extracted = formatName(firstLine);
                console.log('✅ Found name in first line:', extracted);
                return extracted;
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
      const words = line.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2 || words.length > 4) continue;
      const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
      if (!allAlpha) continue;
      const capitalCount = words.filter(w => /^[A-Z]/.test(w)).length;
      const allCapsCount = words.filter(w => w === w.toUpperCase() && w.length > 1).length;
      const capitalRatio = capitalCount / words.length;
      const isAllCaps = allCapsCount === words.length && words.length >= 2;
      if ((capitalRatio >= 0.9 || isAllCaps) && !/\d{2,}/.test(line) && !isBad(line)) {
        const extracted = formatName(line);
        console.log(`✅ Found name in line ${i + 1}:`, extracted);
        return extracted;
      }
    }
    // Check lines 4-10 with slightly relaxed criteria
    for (let i = 3; i < Math.min(10, lines.length); i++) {
      const line = lines[i];
      if (isBad(line) || line.length < 3 || line.length > 100) continue;
      const words = line.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2 || words.length > 6) continue;
      const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
      if (!allAlpha) continue;
      const capitalCount = words.filter(w => /^[A-Z]/.test(w)).length;
      const allCapsCount = words.filter(w => w === w.toUpperCase() && w.length > 1).length;
      const capitalRatio = capitalCount / words.length;
      const isAllCaps = allCapsCount === words.length && words.length >= 2;
      if ((capitalRatio >= 0.7 || isAllCaps) && !/\d{2,}/.test(line)) {
        if (!isBad(line)) {
          const extracted = formatName(line);
          console.log(`✅ Found name in line ${i + 1}:`, extracted);
          return extracted;
        }
      }
    }

    // 3) Look for patterns like "FIRSTNAME LASTNAME" (all caps) or "Firstname Lastname" (title case)
    for (let i = 0; i < Math.min(8, lines.length); i++) {
      const line = lines[i];
      if (isBad(line) || line.length < 3 || line.length > 80) continue;
      
      const words = line.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2 && words.length <= 5) {
        // Check if all words are alphabetic
        const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
        if (!allAlpha) continue;
        
        // Pattern 1: All uppercase (like "JOHN DOE")
        const allUpper = words.every(w => w === w.toUpperCase() && w.length > 1);
        // Pattern 2: Title case (like "John Doe")
        const titleCase = words.every(w => /^[A-Z][a-z]+$/.test(w));
        // Pattern 3: Mixed but mostly capitals
        const mostlyCap = words.filter(w => /^[A-Z]/.test(w)).length >= words.length * 0.6;
        
        if ((allUpper || titleCase || mostlyCap) && !/\d/.test(line) && !/@/.test(line)) {
          const extracted = formatName(line);
          console.log(`✅ Found name pattern in line ${i + 1}:`, extracted);
          return extracted;
        }
      }
    }

    // 3.5) Combine consecutive single-word lines (common PDF extraction quirk)
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
        const extracted = formatName(collected.join(' '));
        console.log('✅ Combined single-word lines into name:', extracted);
        return extracted;
      }
    }

    // 3.6) Scan first 5 lines for multi-word uppercase name fragments (name is at top)
    const firstBlock = lines.slice(0, 5).join(' ');
    const multiWordRx = /\b([A-Z][A-Za-z'.-]{1,})(?:\s+[A-Z][A-Za-z'.-]{1,}){1,3}\b/g;
    for (const match of firstBlock.matchAll(multiWordRx)) {
      const candidate = match[0].trim();
      if (isBad(candidate) || candidate.length > 60) continue;
      const words = candidate.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2 || words.length > 4) continue; // Names are 2-4 words
      if (words.some(w => w.length < 2)) continue;
      if (words.some(w => /[.,;:!?\-]{2,}/.test(w))) continue; // Reject if has punctuation clusters
      if (isBad(candidate)) continue; // Double check with isBad
      const extracted = formatName(candidate);
      console.log('✅ Found name via uppercase block:', extracted);
      return extracted;
    }

    // 4) Try to find name before email (often name is on line before email)
    if (email) {
      const emailIndex = lines.findIndex(l => l.includes(email));
      if (emailIndex > 0) {
        const beforeEmail = lines[emailIndex - 1];
        if (beforeEmail && !isBad(beforeEmail) && beforeEmail.length >= 3 && beforeEmail.length <= 80) {
          const words = beforeEmail.split(/\s+/).filter(w => w.length > 0);
          if (words.length >= 2 && words.length <= 5) {
            const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
            if (allAlpha && !/@/.test(beforeEmail) && !/\d{2,}/.test(beforeEmail)) {
            const extracted = formatName(beforeEmail);
              console.log('✅ Found name before email:', extracted);
              return extracted;
            }
          }
        }
      }
    }

    // 5) Email prefix fallback (only if looks like real name parts)
    if (email) {
      const prefix = email.split('@')[0];
      const parts = prefix.split(/[._-]+/).filter(p => p.length >= 2 && /^[a-z]+$/i.test(p));
      if (parts.length >= 2 && parts.length <= 3) {
        const raw = parts.join(' ');
        const nameFromEmail = formatName(raw);
        console.log('⚠️ Using email prefix as name:', nameFromEmail);
        return nameFromEmail;
      }
    }

    // 6) Filename fallback (clean it up)
    const fallback = fileName
      .replace(/\.(pdf|docx)$/i, '')
      .replace(/^\d+_\d+_\d*_?/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b(resume|cv|curriculum|vitae|_)\b/ig, '')
      .trim();
    
    if (fallback && fallback.length >= 2) {
      const formatted = formatName(fallback);
      console.log('⚠️ Using filename as name:', formatted);
      return formatted;
    }
    
    console.log('❌ Could not extract name, using filename:', fileName);
    return fileName;
  };

  const parseExperienceYears = (text: string): number => {
    const lower = text.toLowerCase();
    // Check common patterns like "X+ years", "X yrs"
    const patterns = [/(\d{1,2})\s*\+?\s*(years|yrs|year)/g, /(experience)\s*(\d{1,2})\s*(years|yrs)/g];
    let maxYears = 0; let m: RegExpExecArray | null;
    for (const r of patterns) {
      while ((m = r.exec(lower)) !== null) {
        const val = parseInt(m[1] || m[2] || '0');
        if (!isNaN(val)) maxYears = Math.max(maxYears, Math.min(50, val));
      }
    }
    return maxYears;
  };

  const extractResumeDataLocally = (resumeText: string): ExtractedResumeData => {
    const skills = extractSkillsFromText(resumeText);
    const experience = parseExperienceYears(resumeText);
    const eduMatch = resumeText.match(/(Bachelor|Master|B\.Tech|BTech|MCA|MBA|BSc|MSc|PhD)[^\n]{0,80}/i);
    const education = eduMatch ? eduMatch[0] : 'Not specified';
    return { skills, education, experience, fullText: resumeText };
  };

  const cosineSimilarity = (a: string[], b: string[]): number => {
    const all = Array.from(new Set([...a, ...b]));
    let dot = 0, magA = 0, magB = 0;
    for (const key of all) {
      const va = a.filter(x => x === key).length; // 1-hot for now but keeps extension
      const vb = b.filter(x => x === key).length;
      dot += va * vb;
      magA += va * va;
      magB += vb * vb;
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  };

  const jaccard = (a: string[], b: string[]): number => {
    const A = new Set(a);
    const B = new Set(b);
    const inter = Array.from(A).filter(x => B.has(x)).length;
    const uni = new Set([...a, ...b]).size || 1;
    return inter / uni;
  };

  const calculateBasicMatch = (
    extractedData: ExtractedResumeData,
    jobTitle: string,
    jobDescription: string | null,
    jobRequiredSkills: string[] | null,
    jobRequiredExperience: number | null
  ): MatchResult => {
    // If job doesn't specify required skills, derive from description using the dictionary
    const derived = extractSkillsFromText(jobDescription || "");
    const required = (jobRequiredSkills && jobRequiredSkills.length > 0 ? jobRequiredSkills : derived)
      .map(s => String(s).toLowerCase().trim())
      .filter(Boolean);
    const candidate = (extractedData.skills || []).map(s => String(s).toLowerCase().trim());

    // Required skill coverage (dominant) + relevance signals
    const cos = cosineSimilarity(candidate, required);
    const jac = jaccard(candidate, required);
    const desc = (jobDescription || '').toLowerCase();
    const coverage = required.length > 0 ? (new Set(candidate.filter(s => required.includes(s))).size / required.length) : 0;
    const descHits = candidate.filter(s => desc.includes(s)).length;
    const descBonus = Math.min(0.10, (descHits * 0.02)); // up to +10%
    // Blend: emphasize coverage, then best-of (cos/jac) for breadth
    const relevance = Math.max(cos, jac);
    const skillRatio = Math.min(1, (coverage * 0.8) + (relevance * 0.2) + descBonus);
    const skillComponent = skillRatio * 80; // 80% weight to skills
    const expReq = Math.max(0, Number(jobRequiredExperience || 0));
    const expRatio = expReq > 0 ? Math.min((extractedData.experience || 0) / expReq, 1) : 1;
    const experienceComponent = expRatio * 20; // 20% weight to experience

    // Education bonus: CS/Engineering/Technology adds +0..5
    const edu = (extractedData.education || '').toLowerCase();
    const eduGood = /(computer|software|information|electronics|technology|engineering)/.test(edu);
    const educationBonus = eduGood ? 5 : 0;

    const score = Math.round(Math.max(0, Math.min(100, skillComponent + experienceComponent + educationBonus)));
    return {
      score,
      explanation: `Deterministic match for ${jobTitle}: skills ${Math.round(skillComponent)}%, experience ${Math.round(experienceComponent)}%`,
      extractedData,
    };
  };

  // Removed AI extraction function (local extraction only)

  // AI scoring removed; use deterministic
  const calculateMatchWithAI = async (
    extractedData: ExtractedResumeData,
    jobTitle: string,
    jobDescription: string | null,
    jobRequiredSkills: string[] | null,
    jobRequiredExperience: number | null
  ): Promise<MatchResult> => {
    return calculateBasicMatch(extractedData, jobTitle, jobDescription, jobRequiredSkills, jobRequiredExperience);
  };

  /**
   * Get resume text from storage bucket or database
   */
  const getResumeText = async (resumeUrl: string | null, existingResumeText: string | null): Promise<string> => {
    // If we already have resume text in DB, use it
    if (existingResumeText && existingResumeText.trim().length > 100) {
      console.log('✅ Using existing resume text from database');
      return existingResumeText;
    }

    // If we have a resume URL, download and extract text from PDF
    if (resumeUrl) {
      try {
        // Parse storage path - could be "bucket/path" or just "filename"
        let bucketName = 'resumes-private'; // Default bucket
        let filePath = resumeUrl;

        if (resumeUrl.includes('/')) {
          // If it contains a slash, first part might be bucket name
          const parts = resumeUrl.split('/');
          if (parts[0] === 'resumes-private' || parts[0] === 'resumes') {
            bucketName = parts[0];
            filePath = parts.slice(1).join('/');
          } else {
            // No bucket prefix, use default
            filePath = resumeUrl;
          }
        }

        // Check if it's a full HTTP URL (public URL)
        if (resumeUrl.startsWith('http')) {
          console.log('📥 Using public URL:', resumeUrl);
          const text = await extractTextFromPDFUrl(resumeUrl);
          if (text && text.trim().length > 50) {
            console.log(`✅ Extracted ${text.length} characters from PDF`);
            return text;
          }
        } else {
          // Download directly from Supabase storage (handles private buckets)
          console.log(`📦 Downloading from storage: ${bucketName}/${filePath}`);
          const text = await extractTextFromSupabaseStorage(supabase, bucketName, filePath);
          if (text && text.trim().length > 50) {
            console.log(`✅ Extracted ${text.length} characters from PDF`);
            return text;
          }
        }
      } catch (error: any) {
        console.error('⚠️ Failed to extract text from PDF:', error);
        console.error('Error details:', error.message);
        // Fallback to existing text if available
        if (existingResumeText && existingResumeText.trim().length > 50) {
          console.log('📄 Using existing database text as fallback');
          return existingResumeText;
        }
        throw new Error(`Cannot extract text from resume: ${error.message}`);
      }
    }

    throw new Error('No resume text available - cannot extract data');
  };

  // AI mutation removed; keep simple placeholder
  const matchMutation = { isPending: false } as any;

  // Removed AI run handler
  
  const DICT = useMemo(
    () => [
      'react','react.js','reactjs','next','next.js','vue','angular','svelte','javascript','typescript','node','node.js','express','nest','nest.js','java','spring','spring boot','kotlin','python','django','flask','fastapi','.net','dotnet','c#','c++','go','golang','rust','sql','postgres','mysql','mariadb','sqlite','mongodb','redis','aws','azure','gcp','docker','kubernetes','k8s','terraform','ansible','html','css','sass','scss','tailwind','graphql','rest','grpc','kafka','rabbitmq','spark','hadoop','hive','airflow','pandas','numpy','scikit-learn','tensorflow','pytorch','ml','ai'
    ],
    []
  );

  const openEditDialog = (result: LocalResult, index: number) => {
    setEditingResultIndex(index);
    setEditForm({
      name: result.name || "",
      email: result.email || "",
      phone: result.phone || "",
      skills: result.skills.join(", "),
    });
    setEditDialogOpen(true);
  };

  const resetEditDialog = () => {
    setEditDialogOpen(false);
    setEditingResultIndex(null);
    setEditForm({
      name: "",
      email: "",
      phone: "",
      skills: "",
    });
    setEditSaving(false);
  };

  const handleSaveEditedResult = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editingResultIndex === null) return;

    const currentResult = localResults[editingResultIndex];
    if (!currentResult) return;

    const nameInput = editForm.name.trim();
    const emailInput = editForm.email.trim();
    const emailLookup = emailInput.toLowerCase();
    const phoneInput = editForm.phone.trim();
    const parsedSkills = editForm.skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
    const effectiveSkills = parsedSkills.length > 0 ? parsedSkills : currentResult.skills;
    const normalizedSource = normalizeResumePath(currentResult.source) || currentResult.source;

    setEditSaving(true);
    try {
      let candidateId = currentResult.candidateId || null;

      const findCandidateByEmail = async () => {
        if (!emailLookup) return null;
        const { data, error } = await supabase
          .from("candidates")
          .select("id")
          .eq("email", emailLookup)
          .maybeSingle();
        if (error) {
          console.warn("Email lookup failed:", error);
          return null;
        }
        return data?.id || null;
      };

      const findCandidateByResume = async (resumePath: string | null) => {
        if (!resumePath) return null;
        const { data, error } = await supabase
          .from("candidates")
          .select("id")
          .eq("resume_url", resumePath)
          .maybeSingle();
        if (error) {
          console.warn("Resume lookup failed:", error);
          return null;
        }
        return data?.id || null;
      };

      if (!candidateId && emailLookup) {
        candidateId = await findCandidateByEmail();
      }

      if (!candidateId && normalizedSource) {
        candidateId = await findCandidateByResume(normalizedSource);
      }

      if (!candidateId && currentResult.source !== normalizedSource) {
        candidateId = await findCandidateByResume(currentResult.source);
      }

      if (!candidateId) {
        const fileName = normalizeResumePath(currentResult.source).split("/").pop();
        if (fileName) {
          candidateId = await findCandidateByResume(fileName);
        }
      }

    const emailToSave = emailInput || (emailLookup ? emailLookup : null);
    const finalEmail = emailToSave || `noemail+${Date.now()}@example.com`;
    const updatePayload = {
        full_name: nameInput || currentResult.name,
        email: finalEmail,
        phone: phoneInput || null,
        skills: effectiveSkills,
        resume_url: normalizedSource,
      };

      if (candidateId) {
        const { error } = await supabase
          .from("candidates")
          .update(updatePayload)
          .eq("id", candidateId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("candidates")
          .insert({
            ...updatePayload,
            status: "Pending",
          })
          .select("id")
          .single();
        if (error) throw error;
        candidateId = data?.id || null;
      }

      setLocalResults((prev) =>
        prev.map((result, idx) =>
          idx === editingResultIndex
            ? {
                ...result,
                name: updatePayload.full_name,
                email: finalEmail,
                phone: updatePayload.phone,
                skills: effectiveSkills,
                candidateId: candidateId ?? result.candidateId,
              }
            : result
        )
      );

      await queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });
      await queryClient.invalidateQueries({ queryKey: ["candidates-count"] });

      toast({
        title: "Candidate updated",
        description: "Changes saved to dashboard.",
      });

      resetEditDialog();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save changes.",
        variant: "destructive",
      });
    } finally {
      setEditSaving(false);
    }
  };

  const handleLocalMatch = async () => {
    if (!selectedJob) {
      toast({ title: 'Select a job', description: 'Choose a job (or All) to run local match.' });
      return;
    }
    setLocalPending(true);
    setLocalResults([]);
    try {
      let reqSkills: string[] = [];
      let minMatches = 0;

      if (!isAllJobsSelection) {
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .select('id, job_title, required_skills')
          .eq('id', selectedJob)
          .single();
        if (jobError) throw jobError;
        reqSkills = (jobData?.required_skills || []).map((s: any) => String(s).toLowerCase());
        if (reqSkills.length === 0) {
          toast({ title: 'No required skills', description: 'This job has no required_skills.' });
          setLocalPending(false);
          return;
        }
        minMatches = Math.min(3, Math.max(1, reqSkills.length));
      }

      const { data: candidateRows, error: candidateError } = await supabase
        .from('candidates')
        .select('id, full_name, email, phone, resume_url, skills');
      if (candidateError) throw candidateError;

      const candidateByEmail = new Map<string, CandidateRecord>();
      const candidateByResume = new Map<string, CandidateRecord>();

      (candidateRows || []).forEach((candidate: CandidateRecord) => {
        if (candidate.email) {
          candidateByEmail.set(candidate.email.toLowerCase(), candidate);
        }
        if (candidate.resume_url) {
          for (const key of buildResumeKeyVariants(candidate.resume_url)) {
            candidateByResume.set(key, candidate);
          }
        }
      });

      const resolveCandidate = (sourcePath: string, email: string | null) => {
        for (const key of buildResumeKeyVariants(sourcePath)) {
          const candidate = candidateByResume.get(key);
          if (candidate) return candidate;
        }
        if (email) {
          const candidate = candidateByEmail.get(email.toLowerCase());
          if (candidate) return candidate;
        }
        return undefined;
      };

      const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET || 'resumes';
      const buckets = Array.from(new Set([envBucket, 'resumes', 'resumes-private']));
      const results: LocalResult[] = [];

      for (const bucket of buckets) {
        const { data: files } = await supabase.storage.from(bucket).list('', { limit: 1000 });
        for (const f of files || []) {
          if (!/\.pdf$/i.test(f.name)) continue;
          try {
            const sourcePath = `${bucket}/${f.name}`;
            const text = await extractTextFromSupabaseStorage(supabase, bucket, f.name);
            const lower = text.toLowerCase();
            const allSkills = Array.from(new Set(DICT.filter(k => lower.includes(k))));
            const matched = isAllJobsSelection ? allSkills.slice(0, 20) : reqSkills.filter(s => lower.includes(s));
            if (!isAllJobsSelection && matched.length < minMatches) continue;
            const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null);
            const phoneRaw = (text.match(/(\+?\d[\d\s().-]{7,}\d)/g)?.[0] || null);
            const phone = phoneRaw ? phoneRaw.replace(/[^+\d]/g, '') : null;
            
            const name = extractCandidateName(text, email, f.name);
            const candidateRecord = resolveCandidate(sourcePath, email);
            const displayName = candidateRecord?.full_name || name;
            const displayEmail = candidateRecord?.email || email;
            const displayPhone = candidateRecord?.phone || phone;
            const displaySkills =
              candidateRecord?.skills && candidateRecord.skills.length > 0
                ? (candidateRecord.skills.filter(Boolean) as string[])
                : allSkills;

            results.push({
              candidateId: candidateRecord?.id ?? null,
              name: displayName,
              email: displayEmail,
              phone: displayPhone,
              skills: displaySkills,
              matched,
              source: sourcePath,
            });
          } catch {
            // ignore file errors
          }
        }
      }
      setLocalResults(results);
      if (results.length === 0) {
        toast({
          title: isAllJobsSelection ? 'No resumes found' : 'No matches',
          description: isAllJobsSelection
            ? 'No PDF resumes were found in storage.'
            : `No resumes matched ≥${minMatches} required skills.`,
        });
      }
    } catch (e: any) {
      toast({ title: 'Local match failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setLocalPending(false);
    }
  };

  // Handle PDF view - open in new tab
  const handleViewPDF = async (source: string) => {
    try {
      const [bucket, ...fileParts] = source.split('/');
      const fileName = fileParts.join('/');
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(fileName, 3600); // 1 hour expiry
      
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      toast({
        title: "Error viewing PDF",
        description: err.message || "Could not open PDF",
        variant: "destructive",
      });
    }
  };

  // Handle PDF download
  const handleDownloadPDF = async (source: string) => {
    try {
      const [bucket, ...fileParts] = source.split('/');
      const fileName = fileParts.join('/');
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(fileName);
      
      if (error) throw error;
      if (data) {
        const url = window.URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({
          title: "Download started",
          description: `Downloading ${fileName}`,
        });
      }
    } catch (err: any) {
      toast({
        title: "Error downloading PDF",
        description: err.message || "Could not download PDF",
        variant: "destructive",
      });
    }
  };

  // Handle Shortlist action
  const handleShortlist = async (result: LocalResult) => {
    const processingKey = `${result.source}-shortlist`;
    setProcessingStatus(processingKey);
    
    try {
      // Find or create candidate in database
      let candidateId: string | null = result.candidateId ?? null;
      
      if (!candidateId && result.email) {
        // Try to find existing candidate by email
        const { data: existing } = await supabase
          .from('candidates')
          .select('id')
          .ilike('email', result.email)
          .maybeSingle();
        
        if (existing) {
          candidateId = existing.id;
        }
      }

      // If not found, create new candidate
      if (!candidateId) {
        const { data: newCandidate, error: createError } = await supabase
          .from('candidates')
          .insert({
            full_name: result.name,
            email: result.email || `noemail+${Date.now()}@example.com`,
            phone: result.phone,
            skills: result.skills,
            status: 'Shortlisted',
            resume_url: result.source,
            job_id: selectedJob || null,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        candidateId = newCandidate.id;
      } else {
        // Update existing candidate
        const { error: updateError } = await supabase
          .from('candidates')
          .update({
            status: 'Shortlisted',
            full_name: result.name,
            phone: result.phone,
            skills: result.skills,
            job_id: selectedJob || null,
            resume_url: result.source,
          })
          .eq('id', candidateId);

        if (updateError) throw updateError;
      }

      if (candidateId && candidateId !== result.candidateId) {
        setLocalResults((prev) =>
          prev.map((item) =>
            item.source === result.source ? { ...item, candidateId } : item
          )
        );
      }

      const jobRecord = jobs.find((job: any) => job.id === selectedJob);
      const jobTitleSnapshot = jobRecord?.job_title ?? null;

      try {
        const { data: authData } = await supabase.auth.getUser();
        const shortlistedBy = authData?.user?.id ?? null;
        await supabase.from('shortlist_records').insert({
          candidate_snapname: result.name,
          candidate_snapemail: result.email,
          candidate_snapphone: result.phone,
          resume_url: result.source,
          candidate_id: candidateId ?? null,
          job_id: selectedJob || null,
          job_snaptitle: jobTitleSnapshot,
          shortlisted_by: shortlistedBy,
          status: 'Shortlisted',
        });
      } catch (err) {
        console.warn('Failed to log shortlist record', err);
      }

      // Log activity
      const { error: logError } = await supabase.from('activity_logs').insert({
        action: 'STATUS_UPDATED',
        details: `${result.name} has been shortlisted`,
      });

      if (logError) console.warn('Failed to log activity:', logError);

      toast({
        title: "Candidate Shortlisted",
        description: `${result.name} has been added to the shortlist`,
      });

      // Invalidate queries and redirect to shortlist page
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      setTimeout(() => {
        navigate('/shortlist');
      }, 1000);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to shortlist candidate",
        variant: "destructive",
      });
    } finally {
      setProcessingStatus(null);
    }
  };

  // Handle Reject action
  const handleReject = async (result: LocalResult) => {
    const processingKey = `${result.source}-reject`;
    setProcessingStatus(processingKey);
    
    try {
      // Find or create candidate in database
      let candidateId: string | null = result.candidateId ?? null;
      
      if (!candidateId && result.email) {
        const { data: existing } = await supabase
          .from('candidates')
          .select('id')
          .ilike('email', result.email)
          .maybeSingle();
        
        if (existing) {
          candidateId = existing.id;
        }
      }

      // If not found, create new candidate with Rejected status
      if (!candidateId) {
        const { data: newCandidate, error: createError } = await supabase
          .from('candidates')
          .insert({
            full_name: result.name,
            email: result.email || `noemail+${Date.now()}@example.com`,
            phone: result.phone,
            skills: result.skills,
            status: 'Rejected',
            resume_url: result.source,
            job_id: selectedJob || null,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        candidateId = newCandidate.id;
      } else {
        // Update existing candidate
        const { error: updateError } = await supabase
          .from('candidates')
          .update({
            status: 'Rejected',
            full_name: result.name,
            phone: result.phone,
            skills: result.skills,
            job_id: selectedJob || null,
            resume_url: result.source,
          })
          .eq('id', candidateId);

        if (updateError) throw updateError;
      }

      if (candidateId && candidateId !== result.candidateId) {
        setLocalResults((prev) =>
          prev.map((item) =>
            item.source === result.source ? { ...item, candidateId } : item
          )
        );
      }

      // Log activity
      const { error: logError } = await supabase.from('activity_logs').insert({
        action: 'STATUS_UPDATED',
        details: `${result.name} has been rejected`,
      });

      if (logError) console.warn('Failed to log activity:', logError);

      toast({
        title: "Candidate Rejected",
        description: `${result.name} has been rejected`,
      });

      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to reject candidate",
        variant: "destructive",
      });
    } finally {
      setProcessingStatus(null);
    }
  };

  const topScore = matches[0]?.score || 0;

  const getScoreBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-600 text-white text-base px-3 py-1">{score}%</Badge>;
    if (score >= 80) return <Badge className="bg-blue-600 text-white text-base px-3 py-1">{score}%</Badge>;
    if (score >= 70) return <Badge className="bg-yellow-600 text-white text-base px-3 py-1">{score}%</Badge>;
    return <Badge variant="secondary" className="text-base px-3 py-1">{score}%</Badge>;
  };

  const getRowClassName = (score: number) => {
    if (score >= 90) return "bg-green-50 hover:bg-green-100 transition-colors";
    if (score >= 80) return "bg-blue-50 hover:bg-blue-100 transition-colors";
    return "hover:bg-accent/50 transition-colors";
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Local Candidate Matching</h1>
        <p className="text-muted-foreground mt-1">Matches resumes by job required_skills</p>
      </div>

      {/* Local matching (no AI) */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Run Candidate Matching</CardTitle>
          <p className="text-sm text-muted-foreground">
            Uses job required_skills to scan PDFs in storage.{" "}
            {minMatchesRequired
              ? `Shows resumes with at least ${minMatchesRequired} skill match${minMatchesRequired > 1 ? "es" : ""}.`
              : "Select a job to see the required skill match threshold."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job-select-local">Select Job Title</Label>
            <Select value={selectedJob} onValueChange={setSelectedJob}>
              <SelectTrigger id="job-select-local">
                <SelectValue placeholder="Choose a job position..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_JOBS_OPTION}>
                  All Jobs (show every resume)
                </SelectItem>
                {visibleJobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.job_title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleLocalMatch} disabled={!selectedJob || localPending}>
            {localPending ? 'Matching…' : 'Run Candidate Matching'}
          </Button>

          {localResults.length > 0 && (
          <div className="overflow-x-auto">
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead>Matched</TableHead>
                  <TableHead>View/Download</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localResults.map((r, i) => {
                  const processingKey = `${r.source}-shortlist`;
                  const rejectKey = `${r.source}-reject`;
                  const isProcessing = processingStatus === processingKey || processingStatus === rejectKey;
                  
                  return (
                    <TableRow key={`${r.source}-${i}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm">{r.email || '—'}</TableCell>
                      <TableCell className="text-sm">{r.phone || '—'}</TableCell>
                      <TableCell className="text-sm">{r.skills.slice(0, 20).join(', ') || '—'}</TableCell>
                      <TableCell className="text-sm">{r.matched.join(', ')}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewPDF(r.source)}
                            className="w-full"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadPDF(r.source)}
                            className="w-full"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(r, i)}
                            className="w-full"
                            disabled={isProcessing}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleShortlist(r)}
                            disabled={isProcessing}
                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                          >
                            {processingStatus === processingKey ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Shortlist
                              </>
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReject(r)}
                            disabled={isProcessing}
                            className="w-full"
                          >
                            {processingStatus === rejectKey ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      {false && showResults && (
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Match Results</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Showing AI-analyzed candidates for: <span className="font-medium text-foreground">
                    {jobs.find(j => j.id === selectedJob)?.job_title}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 text-green-600">
                <TrendingUp className="h-5 w-5" />
                <span className="text-sm font-medium">Top Match: {topScore}%</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate Name</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead className="flex items-center gap-1">
                    <GraduationCap className="h-4 w-4" />
                    Education
                  </TableHead>
                  <TableHead className="flex items-center gap-1">
                    <Briefcase className="h-4 w-4" />
                    Experience
                  </TableHead>
                  <TableHead className="text-right">Match Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No matches found for this job. Run match analysis first.
                    </TableCell>
                  </TableRow>
                ) : (
                  matches.map((match) => (
                    <TableRow key={match.id} className={getRowClassName(match.score)}>
                      <TableCell className="font-medium">{match.name}</TableCell>
                      <TableCell className="text-sm max-w-md">
                        <div className="flex flex-wrap gap-1">
                          {match.skills !== 'N/A' ? (
                            match.skills.split(', ').slice(0, 5).map((skill, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {skill}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">No skills listed</span>
                          )}
                          {match.skills !== 'N/A' && match.skills.split(', ').length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{match.skills.split(', ').length - 5} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{match.education}</TableCell>
                      <TableCell className="text-sm">
                        {match.experience > 0 ? `${match.experience} years` : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        {getScoreBadge(match.score)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetEditDialog();
          } else {
            setEditDialogOpen(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Candidate Details</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSaveEditedResult}>
            <div className="space-y-2">
              <Label htmlFor="edit-result-name">Name</Label>
              <Input
                id="edit-result-name"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Candidate full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-result-email">Email</Label>
              <Input
                id="edit-result-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="candidate@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-result-phone">Phone</Label>
              <Input
                id="edit-result-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+91XXXXXXXXXX"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-result-skills">Skills (comma-separated)</Label>
              <Textarea
                id="edit-result-skills"
                value={editForm.skills}
                onChange={(e) => setEditForm((prev) => ({ ...prev, skills: e.target.value }))}
                rows={4}
                placeholder="react, javascript, node, sql"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetEditDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-gradient-primary hover:opacity-90 text-primary-foreground"
                disabled={editSaving}
              >
                {editSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Upload, CheckCircle, Eye, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { extractTextFromSupabaseStorage } from "@/lib/pdfExtractor";

export default function Resumes() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [autoUploading, setAutoUploading] = useState(false);
  const [skillsQuery, setSkillsQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ bucket: string; file: string; name: string; email: string | null; phone: string | null; skills: string[]; matchedSkills: string[] }>>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Extract candidate name from resume text - AGGRESSIVE extraction to get full name
  const extractCandidateName = (text: string, email: string | null, fileName: string): string => {
    const cleanLine = (s: string) =>
      s
        .replace(/\u00A0/g, ' ')
        .replace(/\b([A-Za-z])\s*\.\s+(?=[A-Za-z])/g, '$1. ')
        .replace(/\b([A-Za-z])\s*\.(?=\s|$)/g, '$1.')
        .replace(/\s+/g, ' ')
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
        const sanitized = sanitizeExtractedName(cleaned);
        if (sanitized) {
          console.log('✅ Found name via label pattern:', sanitized);
          return sanitized;
        }
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
                const extracted = sanitizeExtractedName(firstLine);
                if (extracted) {
                  console.log('✅ Found name in first line:', extracted);
                  return extracted;
                }
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
        const extracted = sanitizeExtractedName(line);
        if (extracted) {
          console.log(`✅ Found name in line ${i + 1}:`, extracted);
          return extracted;
        }
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
          const extracted = sanitizeExtractedName(line);
          if (extracted) {
            console.log(`✅ Found name in line ${i + 1}:`, extracted);
            return extracted;
          }
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
          const extracted = sanitizeExtractedName(line);
          if (extracted) {
            console.log(`✅ Found name pattern in line ${i + 1}:`, extracted);
            return extracted;
          }
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
        const extracted = sanitizeExtractedName(collected.join(' '));
        if (extracted) {
          console.log('✅ Combined single-word lines into name:', extracted);
          return extracted;
        }
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
      const extracted = sanitizeExtractedName(candidate);
      if (extracted) {
        console.log('✅ Found name via uppercase block:', extracted);
        return extracted;
      }
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
              const extracted = sanitizeExtractedName(beforeEmail);
              if (extracted) {
                console.log('✅ Found name before email:', extracted);
                return extracted;
              }
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
        const nameFromEmail = sanitizeExtractedName(raw);
        if (nameFromEmail) {
          console.log('⚠️ Using email prefix as name:', nameFromEmail);
          return nameFromEmail;
        }
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
    const formatted = sanitizeExtractedName(fallback) ?? formatName(fallback);
    console.log('⚠️ Using filename as name:', formatted);
    return formatted;
  }
    
    console.log('❌ Could not extract name, using filename:', fileName);
    return fileName;
  };

  // Handle PDF view - open in new tab
  const handleViewPDF = async (bucket: string, fileName: string) => {
    try {
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
  const handleDownloadPDF = async (bucket: string, fileName: string) => {
    try {
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

  // Job-based matching (no AI)
  const [jobs, setJobs] = useState<Array<{ id: string; job_title: string; required_skills: string[] | null }>>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [jobMatching, setJobMatching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('jobs')
          .select('id, job_title, required_skills')
          .order('created_at', { ascending: false });
        if (!error && data) setJobs(data as any);
      } catch {
        // silently ignore
      }
    })();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setUploadedFiles(files);
      toast({
        title: "Files uploaded successfully",
        description: `${files.length} resume(s) ready for processing`,
      });
      void handleSaveToDatabase(files);
    }
  };

  const handleMatchByJob = async () => {
    if (!selectedJobId) {
      toast({ title: 'Select a job', description: 'Please choose a job title.' });
      return;
    }
    const job = jobs.find(j => j.id === selectedJobId);
    const reqSkills = (job?.required_skills || []).map(s => String(s).toLowerCase());
    if (reqSkills.length === 0) {
      toast({ title: 'No skills on job', description: 'Selected job has no required_skills.' });
      return;
    }
    setJobMatching(true);
    setSearchResults([]);
    try {
      const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET || 'resumes-private';
      const candidateBuckets = Array.from(new Set([envBucket, 'resumes-private', 'resumes']));
      const found: Array<{ bucket: string; file: string; name: string; email: string | null; phone: string | null; skills: string[]; matchedSkills: string[] }> = [];
      for (const bucket of candidateBuckets) {
        const { data: files, error } = await supabase.storage.from(bucket).list(undefined, { limit: 1000 });
        if (error || !files) continue;
        for (const f of files) {
          if (!/\.pdf$/i.test(f.name)) continue;
          try {
            const text = await extractTextFromSupabaseStorage(supabase, bucket, f.name);
            const lower = text.toLowerCase();
            const matched = reqSkills.filter(s => lower.includes(s));
            const minMatches = Math.min(3, Math.max(1, reqSkills.length));
            if (matched.length < minMatches) continue;
            const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null);
            const phoneRaw = (text.match(/(\+?\d[\d\s().-]{7,}\d)/g)?.[0] || null);
            const phone = phoneRaw ? phoneRaw.replace(/[^+\d]/g, '') : null;
            
            const name = extractCandidateName(text, email, f.name);
            const DICT = [
              'react','react.js','reactjs','next','next.js','vue','angular','svelte','javascript','typescript','node','node.js','express','nest','nest.js','java','spring','spring boot','kotlin','python','django','flask','fastapi','.net','dotnet','c#','c++','go','golang','rust','sql','postgres','mysql','mariadb','sqlite','mongodb','redis','aws','azure','gcp','docker','kubernetes','k8s','terraform','ansible','html','css','sass','scss','tailwind','graphql','rest','grpc','kafka','rabbitmq','spark','hadoop','hive','airflow','pandas','numpy','scikit-learn','tensorflow','pytorch','ml','ai'
            ];
            const allSkills = Array.from(new Set(DICT.filter(k => lower.includes(k))));
            found.push({ bucket, file: f.name, name, email, phone, skills: allSkills, matchedSkills: matched });
          } catch {
            // ignore this file
          }
        }
      }
      setSearchResults(found);
      toast({ title: `Matched ${found.length} resume(s)` });
    } catch (e: any) {
      toast({ title: 'Match failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setJobMatching(false);
    }
  };

  const computeFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSaveToDatabase = async (filesOverride?: File[]) => {
    const filesToHandle = filesOverride ?? uploadedFiles;
    if (filesToHandle.length === 0) {
      toast({
        title: "No files selected",
        description: "Choose PDF resumes to upload.",
        variant: "destructive",
      });
      return;
    }

    let successCount = 0;
    let failedCount = 0;

    try {
      const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET || "resumes-private";
      const candidateBuckets = Array.from(new Set([envBucket, "resumes-private", "resumes"]));
      const processedBuckets = new Set<string>();

      for (let i = 0; i < filesToHandle.length; i++) {
        const file = filesToHandle[i];

        if (!/\.pdf$/i.test(file.name)) {
          console.warn(`Skipping non-PDF file: ${file.name}`);
          continue;
        }

        try {
          const fileHash = await computeFileHash(file);

          const { data: existingCandidate, error: hashCheckError } = await supabase
            .from("candidates")
            .select("id, full_name")
            .eq("resume_hash", fileHash)
            .maybeSingle();

          if (hashCheckError) {
            console.warn("Hash check failed:", hashCheckError);
          }

          if (existingCandidate) {
            toast({
              title: "Already Uploaded",
              description: `${file.name} matches ${existingCandidate.full_name}'s existing resume.`,
            });
            continue;
          }

          let hashRecordCreated = false;
          try {
            const { error: hashInsertError } = await supabase
              .from("resume_upload_hashes")
              .insert({ file_hash: fileHash, original_name: file.name });
            if (hashInsertError) {
              if (hashInsertError.code === "23505") {
                toast({
                  title: "Already Uploaded",
                  description: `${file.name} was previously uploaded.`,
                });
                continue;
              }
              throw hashInsertError;
            }
            hashRecordCreated = true;
          } catch (hashInsertErr: any) {
            console.warn("Failed to record hash:", hashInsertErr);
            toast({
              title: "Upload blocked",
              description: `Could not register ${file.name}. Please try again.`,
              variant: "destructive",
            });
            continue;
          }

          const timestamp = Date.now();
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
          const storageFileName = `${timestamp}_${i}_${sanitizedFileName}`;

          console.log(`📤 Uploading ${file.name} to storage bucket...`);
          console.log(`File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

          let lastErr: any = null;
          let uploaded = false;
          let usedBucket = "";
          for (const BUCKET_NAME of candidateBuckets) {
            const { error: uploadError } = await supabase.storage
              .from(BUCKET_NAME)
              .upload(storageFileName, file, {
                cacheControl: "3600",
                upsert: false,
                metadata: { file_hash: fileHash, original_name: file.name },
              });

            if (!uploadError) {
              uploaded = true;
              usedBucket = BUCKET_NAME;
              break;
            }

            lastErr = uploadError;
            const statusCode = (uploadError as { statusCode?: number })?.statusCode;
            const msg = String(uploadError?.message || "").toLowerCase();
            const bucketMissing =
              statusCode === 404 ||
              (msg.includes("not found") && msg.includes("bucket")) ||
              msg.includes("the resource was not found");
            if (!bucketMissing) {
              break;
            }
          }

          if (!uploaded) {
            console.error("❌ Storage upload error:", lastErr);
            await supabase.from("resume_upload_hashes").delete().eq("file_hash", fileHash);
            let errorMessage = lastErr?.message || "Storage upload failed";
            if (String(errorMessage).toLowerCase().includes("not found")) {
              errorMessage = `Bucket not found. Tried: ${candidateBuckets.join(", ")}`;
            }
            toast({
              title: "⚠️ Upload Failed",
              description: `${file.name}: ${errorMessage}`,
              variant: "destructive",
              duration: 8000,
            });
            failedCount++;
            continue;
          }

          console.log(`✅ File uploaded to storage: ${usedBucket}/${storageFileName}`);
          console.log("⏳ Notifying Edge Function to process this file...");
          if (usedBucket) {
            processedBuckets.add(usedBucket);
          }

          try {
            const baseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
            if (baseUrl) {
              const eventUrl = `${baseUrl}/functions/v1/ats-processor/event`;
              await fetch(eventUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bucket: usedBucket, name: storageFileName }),
              }).catch(() => undefined);
            }
          } catch (e) {
            console.warn("Could not notify event endpoint:", e);
          }

          console.log("⏳ Also triggering batch processing as a fallback...");
          successCount++;
        } catch (storageError: any) {
          console.error("Storage upload exception:", storageError);
          toast({
            title: "Upload Error",
            description: `Failed to upload ${file.name}`,
            variant: "destructive",
          });
          failedCount++;
        }
      }

      if (successCount > 0) {
        try {
          const baseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
          if (baseUrl) {
            const fnUrl = `${baseUrl}/functions/v1/ats-processor/process-unprocessed`;
            console.log("🚀 Triggering process-unprocessed:", fnUrl);
            const resp = await fetch(fnUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                buckets: Array.from(processedBuckets),
                force: false,
              }),
            });
            if (!resp.ok) {
              console.warn("process-unprocessed failed with status", resp.status);
            } else {
              const data = await resp.json().catch(() => ({} as any));
              console.log("✅ Processed summary:", data);
            }
          }
        } catch (e) {
          console.warn("Could not trigger process-unprocessed:", e);
        }
      }

      if (successCount > 0) {
        toast({
          title: "✅ Files Uploaded Successfully!",
          description: `${successCount} PDF(s) uploaded. Edge Function is processing (extracting skills, calculating matches)... This may take a few seconds.`,
        });

        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["recent-candidates"] });
          queryClient.invalidateQueries({ queryKey: ["candidates-count"] });
          queryClient.invalidateQueries({ queryKey: ["matches"] });
          console.log("🔄 Refreshing candidate and match data...");
        }, 3000);

        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["recent-candidates"] });
          queryClient.invalidateQueries({ queryKey: ["matches"] });
          queryClient.invalidateQueries({ queryKey: ["candidates"] });
        }, 8000);
      }

      if (failedCount === 0) {
      setUploadedFiles([]);
      }
    } catch (error: any) {
      console.error("Unexpected upload error:", error);
      toast({
        title: "Upload Error",
        description: error?.message || "An unexpected error occurred while uploading resumes.",
        variant: "destructive",
      });
    }
  };

  const handleFindBySkills = async () => {
    const raw = skillsQuery.trim();
    if (!raw) {
      toast({ title: "Enter at least one skill", variant: "destructive" });
      return;
    }
    const skills = Array.from(new Set(raw.split(/[,\n]/).map(s => s.trim().toLowerCase()).filter(Boolean)));
    setSearching(true);
    setSearchResults([]);
    try {
      const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET || 'resumes-private';
      const candidateBuckets = Array.from(new Set([envBucket, 'resumes-private', 'resumes']));
      const found: Array<{ bucket: string; file: string; name: string; email: string | null; phone: string | null; skills: string[]; matchedSkills: string[] }> = [];

      for (const bucket of candidateBuckets) {
        const { data: files, error } = await supabase.storage.from(bucket).list(undefined, { limit: 1000 });
        if (error || !files) continue;
        for (const f of files) {
          if (!/\.pdf$/i.test(f.name)) continue;
          try {
            const text = await extractTextFromSupabaseStorage(supabase, bucket, f.name);
            const lower = text.toLowerCase();
            const matched = skills.filter(s => lower.includes(s));
            if (matched.length === 0) continue;
            const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null);
            const phoneRaw = (text.match(/(\+?\d[\d\s().-]{7,}\d)/g)?.[0] || null);
            const phone = phoneRaw ? phoneRaw.replace(/[^+\d]/g, '') : null;
            const name = extractCandidateName(text, email, f.name);
            // simple local skill extraction using keywords (same as server function list)
            const DICT = [
              'react','react.js','reactjs','next','next.js','vue','angular','svelte','javascript','typescript','node','node.js','express','nest','nest.js','java','spring','spring boot','kotlin','python','django','flask','fastapi','.net','dotnet','c#','c++','go','golang','rust','sql','postgres','mysql','mariadb','sqlite','mongodb','redis','aws','azure','gcp','docker','kubernetes','k8s','terraform','ansible','html','css','sass','scss','tailwind','graphql','rest','grpc','kafka','rabbitmq','spark','hadoop','hive','airflow','pandas','numpy','scikit-learn','tensorflow','pytorch','ml','ai'
            ];
            const allSkills = Array.from(new Set(DICT.filter(k => lower.includes(k))));
            found.push({ bucket, file: f.name, name, email, phone, skills: allSkills, matchedSkills: matched });
          } catch (e) {
            // ignore this file
          }
        }
      }
      setSearchResults(found);
      toast({ title: `Found ${found.length} matching resume(s)` });
    } catch (e: any) {
      toast({ title: "Search failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Upload Candidate Resumes</h1>
        <p className="text-muted-foreground mt-1">Upload and parse PDF or DOCX resume files</p>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Upload Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary transition-colors duration-200">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <label
              htmlFor="resume-upload"
              className="cursor-pointer"
            >
              <span className="text-lg font-medium text-primary hover:underline">
                Click to upload
              </span>
              <span className="text-muted-foreground"> or drag and drop</span>
              <p className="text-sm text-muted-foreground mt-2">
                PDF or DOCX (MAX. 10MB per file)
              </p>
            </label>
            <input
              id="resume-upload"
              type="file"
              className="hidden"
              accept=".pdf,.docx"
              multiple
              onChange={handleFileUpload}
            />
          </div>

          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {uploadedFiles.length} file(s) selected:
              </p>
              <div className="space-y-1">
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    {file.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center">
            {autoUploading ? (
              <span className="flex items-center gap-2 text-sm text-primary font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading & processing resumes…
              </span>
            ) : uploadedFiles.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                Resumes upload and process automatically after selection.
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

        <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Find Resumes by Skills (no AI)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              value={skillsQuery}
              onChange={(e) => setSkillsQuery(e.target.value)}
              placeholder="Enter skills separated by commas, e.g. react, node, sql"
              className="w-full px-3 py-2 border rounded"
            />
            <Button onClick={handleFindBySkills} disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </Button>
            </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Select a Job Title…</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.job_title}</option>
              ))}
            </select>
            <Button onClick={handleMatchByJob} disabled={jobMatching}>
              {jobMatching ? 'Matching…' : 'Run Match (no AI)'}
            </Button>
          </div>
          {searchResults.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead>Matched</TableHead>
                  <TableHead>View/Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchResults.map((r, i) => (
                  <TableRow key={`${r.bucket}-${r.file}-${i}`}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">{r.email || '—'}</TableCell>
                    <TableCell className="text-sm">{r.phone || '—'}</TableCell>
                    <TableCell className="text-sm">{r.skills?.slice(0, 20).join(', ') || '—'}</TableCell>
                    <TableCell className="text-sm">{r.matchedSkills.join(', ')}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewPDF(r.bucket, r.file)}
                          className="w-full"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPDF(r.bucket, r.file)}
                          className="w-full"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          </CardContent>
        </Card>

      
    </div>
  );
}

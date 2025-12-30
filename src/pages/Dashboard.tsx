import { useMemo, useState, type KeyboardEvent } from "react";
import {
  Users,
  Briefcase,
  Plus,
  CheckSquare,
  Calendar,
  MessageSquare,
  FileText,
  Search,
  Eye,
  Edit,
  Upload,
  UserPlus,
  Trash2,
  FileX,
  RefreshCw,
  ChevronDown,
  Award,
  Mail,
  History,
  Clock,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { openResume } from "@/lib/resume";
import { useToast } from "@/hooks/use-toast";
import { extractTextFromSupabaseStorage } from "@/lib/pdfExtractor";

interface CandidateMatch {
  match_score: number | null;
  job_id: string | null;
}

interface RawCandidate {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string | null;
  job_id: string | null;
  resume_url: string | null;
  matches?: CandidateMatch[] | null;
  reference_source?: string | null;
}

interface CandidateRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  jobApplied: string;
  createdAt: string | null;
  createdLabel: string | null;
  resumeUrl: string | null;
  referenceSource?: string | null;
}

const COMPANY_NAME = "Techvitta Innovations Pvt Ltd";

interface JobInfo {
  id: string;
  job_title: string | null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const STORAGE_BUCKETS = ['resumes-private', 'resumes'];

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<CandidateRow | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    referenceSource: "",
  });
  const [addCandidateDialogOpen, setAddCandidateDialogOpen] = useState(false);
  const [newCandidateForm, setNewCandidateForm] = useState({
    name: "",
    email: "",
    phone: "",
    resumeFile: null as File | null,
  });
  const [uploadingResume, setUploadingResume] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadResumesDialogOpen, setUploadResumesDialogOpen] = useState(false);
  const [selectedResumeFiles, setSelectedResumeFiles] = useState<File[]>([]);
  const [uploadingResumes, setUploadingResumes] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [resumeRequestHistoryOpen, setResumeRequestHistoryOpen] = useState(false);
  const [resumeRequestHistoryEntries, setResumeRequestHistoryEntries] = useState<any[]>([]);
  const [resumeRequestHistoryLoading, setResumeRequestHistoryLoading] = useState(false);
  const [lastResumeRequestSent, setLastResumeRequestSent] = useState<{ date: string; time: string } | null>(null);

  const COMPANY_NAME = "Techvitta Innovations Pvt Ltd";

  // Send "request resume" email to candidates without a resume
  const requestResumeEmailMutation = useMutation({
    mutationFn: async () => {
      if (!editingCandidate) {
        throw new Error("No candidate selected");
      }

      const email = (editForm.email || editingCandidate.email || "").trim();
      const name = (editForm.name || editingCandidate.name || "Candidate").trim();
      const referenceSource = (editForm.referenceSource || "").trim();

      if (!email) {
        throw new Error("Candidate email is missing");
      }

      if (!referenceSource) {
        throw new Error("Please select a Reference Source before sending the resume request email.");
      }

      // Before sending, check if a request-resume email was already sent
      const { data: existingLogs, error: historyError } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("action", "REQUEST_RESUME_EMAIL_SENT")
        .ilike("details", `%${email}%`)
        .limit(1);

      if (historyError) {
        console.error("Failed to check resume request history:", historyError);
      } else if (existingLogs && existingLogs.length > 0) {
        throw new Error("Resume request email has already been sent to this candidate.");
      }

      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: email,
          candidateName: name,
          emailType: "request-resume",
          data: {
            companyName: COMPANY_NAME,
            referenceSource: referenceSource || undefined,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to send resume request email");
      }

      // Log the resume request email in activity logs
      const { error: logError } = await supabase.from("activity_logs").insert({
        action: "REQUEST_RESUME_EMAIL_SENT",
        details: `Resume request email sent to ${name} (${email})`,
      });
      if (logError) {
        console.error("Failed to log resume request email activity:", logError);
      }
    },
    onSuccess: () => {
      const now = new Date();
      setLastResumeRequestSent({
        date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      });
      toast({
        title: "Email Sent",
        description: "Resume request email has been sent to the candidate.",
      });
    },
    onError: (error: any) => {
      toast({
        title: error?.message === "Resume request email has already been sent to this candidate."
          ? "Already sent"
          : "Error",
        description: error?.message || "Failed to send resume request email.",
        variant: error?.message === "Resume request email has already been sent to this candidate."
          ? "default"
          : "destructive",
      });
    },
  });

  const parseStorageLocation = (value: string | null | undefined) => {
    if (!value) {
      return { bucket: null, path: null, normalized: null, filename: null };
    }

    let normalized = value.trim();
    normalized = normalized.split('?')[0];
    normalized = normalized
      .replace(/^https?:\/\/[^\/]+\/storage\/v1\/object\//, '')
      .replace(/^https?:\/\/[^\/]+\//, '')
      .replace(/^storage\/v1\/object\//, '')
      .replace(/^sign\/v1\/authorization-header\/s\//, '')
      .replace(/^sign\//, '')
      .replace(/^download\//, '')
      .replace(/^object\/public\//, '')
      .replace(/^object\/private\//, '')
      .replace(/^public\//, '')
      .replace(/^private\//, '')
      .replace(/^\/+/, '');

    const parts = normalized.split('/');
    if (parts.length < 2) {
      const filenameOnly = parts[0] || null;
      return { bucket: null, path: filenameOnly, normalized: filenameOnly, filename: filenameOnly };
    }

    const bucket = parts.shift() || null;
    const path = parts.join('/');
    const filename = path ? path.split('/').pop() || null : null;

    return {
      bucket,
      path,
      normalized: bucket && path ? `${bucket}/${path}` : normalized || null,
      filename,
    };
  };

  const buildPathVariants = (path?: string | null, filename?: string | null) => {
    const variants = new Set<string>();

    const addVariant = (value?: string | null) => {
      if (!value) return;
      let cleaned = value.trim().replace(/^\/+/, '');
      if (!cleaned) return;
      variants.add(cleaned);
      variants.add(cleaned.replace(/^public\//, ''));
      variants.add(cleaned.replace(/^private\//, ''));
    };

    addVariant(path);
    addVariant(filename);

    return Array.from(variants).filter(Boolean);
  };

  const HIDDEN_JOBS_KEY = "cms-hidden-jobs";

  // Fetch total jobs (respect locally hidden/deleted jobs)
  const { data: jobsCount = 0 } = useQuery({
    queryKey: ["jobs-count"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("id");
      if (error) throw error;

      let hiddenIds: string[] = [];
      if (typeof window !== "undefined") {
        try {
          const stored = window.localStorage.getItem(HIDDEN_JOBS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              hiddenIds = parsed.map((id: any) => String(id));
            }
          }
        } catch (err) {
          console.warn("Failed to read hidden jobs from storage", err);
        }
      }

      const hiddenSet = new Set(hiddenIds);
      return (data || []).filter((job) => !hiddenSet.has(String(job.id))).length;
    },
  });

  // Fetch counts for each category
  const { data: shortlistedCount } = useQuery({
    queryKey: ['shortlisted-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Shortlisted');
      return count || 0;
    },
  });

  const { data: interviewScheduledCount } = useQuery({
    queryKey: ['interview-scheduled-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Interview Scheduled');
      return count || 0;
    },
  });

  const { data: feedbackCount } = useQuery({
    queryKey: ['feedback-count'],
    queryFn: async () => {
      // Count candidates who have interviews scheduled (they need feedback)
      const { count } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Interview Scheduled');
      return count || 0;
    },
  });

  const { data: approvedCount } = useQuery({
    queryKey: ['approved-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Approved');
      return count || 0;
    },
  });

  const { data: documentVerificationCount } = useQuery({
    queryKey: ['document-verification-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, document_verification_status')
        .eq('status', 'Interview Scheduled');

      if (error) throw error;

      // Count candidates who need document verification (not_requested or null)
      const count = (data || []).filter(
        (c: any) => !c.document_verification_status || c.document_verification_status === 'not_requested'
      ).length;

      return count;
    },
  });

  const { data: experienceLetterCount } = useQuery({
    queryKey: ['experience-letter-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('experience-letters')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    },
  });

  const { data: jobList = [] } = useQuery({
    queryKey: ['job-basic-info'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_title');
      if (error) throw error;
      return (data || []) as JobInfo[];
    },
  });

  // Fetch all candidate uploads from database AND storage buckets
  const { data: latestCandidatesRaw = [], refetch: refetchCandidates } = useQuery({
    queryKey: ['all-candidates-with-storage'],
    queryFn: async () => {
      // Step 1: Fetch all candidates from database
      let allCandidates: RawCandidate[] = [];
      let from = 0;
      const pageSize = 1000; // Supabase max per page
      let hasMore = true;
      const seenIds = new Set<string>();

      while (hasMore) {
        const { data, error } = await supabase
          .from('candidates')
          .select(`
            id,
            full_name,
            email,
            phone,
            status,
            created_at,
            job_id,
            resume_url,
            reference_source,
            matches (
              match_score,
              job_id
            )
          `)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          for (const candidate of data as RawCandidate[]) {
            if (candidate.id && !seenIds.has(candidate.id)) {
              seenIds.add(candidate.id);
              allCandidates.push(candidate);
            }
          }
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Step 1.5: Get list of deleted files and filter out database candidates with deleted resume URLs
      const getDeletedFiles = (): Set<string> => {
        try {
          const stored = localStorage.getItem('deleted-resume-files');
          if (!stored) return new Set();
          const parsed = JSON.parse(stored) as string[];
          return new Set(parsed);
        } catch {
          return new Set();
        }
      };
      const deletedFiles = getDeletedFiles();

      // Filter out database candidates whose resume_url matches deleted file identifiers
      allCandidates = allCandidates.filter((candidate) => {
        if (!candidate.resume_url) return true;

        const parsed = parseStorageLocation(candidate.resume_url);
        const isDeleted = deletedFiles.has(candidate.resume_url) ||
          (parsed.normalized && deletedFiles.has(parsed.normalized)) ||
          (parsed.filename && deletedFiles.has(parsed.filename)) ||
          (parsed.bucket && parsed.filename && deletedFiles.has(`${parsed.bucket}/${parsed.filename}`)) ||
          (parsed.bucket && parsed.filename && deletedFiles.has(`${parsed.bucket}-${parsed.filename}`));

        if (isDeleted) {
          console.log(`Filtering out deleted database candidate: ${candidate.id} (${candidate.resume_url})`);
        }

        return !isDeleted;
      });

      // Step 2: Fetch all files from storage buckets
      const storageFiles = new Map<string, { name: string; created_at: string; bucket: string }>();
      const buckets = STORAGE_BUCKETS;

      for (const bucket of buckets) {
        try {
          // List all files in the bucket (Supabase storage.list doesn't support offset, so we get all at once)
          const { data: files, error: listError } = await supabase.storage
            .from(bucket)
            .list('', {
              limit: 10000, // Large limit to get all files
              sortBy: { column: 'created_at', order: 'desc' }
            });

          if (listError) {
            console.warn(`Error listing files from ${bucket}:`, listError.message);
            continue;
          }

          if (files && files.length > 0) {
            for (const file of files) {
              if (file.name.toLowerCase().endsWith('.pdf')) {
                // Use resume_url as key to match with database entries
                const resumeUrl = `${bucket}/${file.name}`;
                if (!storageFiles.has(resumeUrl)) {
                  storageFiles.set(resumeUrl, {
                    name: file.name,
                    created_at: file.created_at || file.updated_at || new Date().toISOString(),
                    bucket
                  });
                }
              }
            }
          }
        } catch (err) {
          console.warn(`Error accessing bucket ${bucket}:`, err);
        }
      }

      // Step 3: Create a map of existing candidates by resume_url and filename
      const candidatesByResumeUrl = new Map<string, RawCandidate>();
      const candidatesByFilename = new Map<string, RawCandidate>();

      for (const candidate of allCandidates) {
        if (!candidate.resume_url) continue;

        const { normalized, filename } = parseStorageLocation(candidate.resume_url);

        if (normalized) {
          candidatesByResumeUrl.set(normalized, candidate);
        }

        if (filename) {
          candidatesByFilename.set(filename, candidate);
          for (const bucket of buckets) {
            candidatesByResumeUrl.set(`${bucket}/${filename}`, candidate);
          }
        }
      }

      // Step 4: Add storage files that don't have database entries and extract name, email, phone
      // Use the EXACT same comprehensive name extraction logic as matching engine (ats-processor)
      const extractCandidateName = (text: string, email: string | null = null, fileName: string = ""): string => {
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
          "prometheus", "kibana", "elastic", "splunk", "datadog", "newrelic", "sentry", "rollbar",
          "rust", "strong", "proficient", "experienced", "familiar", "knowledge", "expertise"
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
            "career", "specialization", "profile", "learning", "great",
            "vidyapeetham", "institute", "institution", "academy", "school", "polytechnic", "engineering",
            "management", "studies", "campus", "department", "faculty", "amrita", "iit", "nit", "iim",
            "eac", "vishwa"
          ];
          return badKeywords.some((kw) => lower.includes(kw)) ||
            /^https?:\/\//.test(s) ||
            /^\d+[\s\d-]*$/.test(s) ||
            /@/.test(s) ||
            /[.,;:!?\-]{2,}/.test(s) ||
            /\b(section|heading|title|header|project|feature|technolog)\b/i.test(lower) ||
            looksLikeSkillList(s) ||
            containsTechTerms(s) ||
            s.split(/[\s,]+/).some((w) => skillWords.has(w.toLowerCase().trim())) ||
            /^[A-Z][a-z]+\.\s*[A-Z][a-z]+$/.test(s) || // Pattern like "Rust. Strong"
            /^[A-Z]{1,2}$/.test(s.trim()); // Reject single/double letter initials like "RS"
        };

        const allLines = text.split(/\r?\n/).map(cleanLine).filter(l => l.length > 0);
        const lines = allLines.slice(0, 20);

        const labelPatterns = [
          /(?:^|\n)\s*(?:name|full\s+name|fullname|applicant\s+name|candidate\s+name)[:\-\s]+([A-Za-z][A-Za-z\s.'-]{2,100})/i,
          /(?:^|\n)\s*(?:name|full\s+name)[:\-\s]+([A-Za-z][A-Za-z\s.'-]{2,100})/i,
        ];
        for (const pattern of labelPatterns) {
          const match = text.match(pattern)?.[1]?.trim();
          if (match) {
            const cleaned = cleanLine(match);
            if (cleaned.length >= 3 && cleaned.length <= 100 && !isBad(cleaned) && !/@/.test(cleaned)) {
              return formatName(cleaned);
            }
          }
        }

        if (lines.length > 0) {
          const firstLine = lines[0];
          if (looksLikeSkillList(firstLine) || containsTechTerms(firstLine) || firstLine.split(/[\s,]+/).some((w) => skillWords.has(w.toLowerCase().trim()))) {
          } else if (!isBad(firstLine) && firstLine.length >= 3 && firstLine.length <= 60) {
            const words = firstLine.split(/\s+/).filter(w => w.length > 0);
            if (words.length >= 2 && words.length <= 4) {
              const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
              if (allAlpha) {
                const hasSkillWord = words.some((w) => skillWords.has(w.toLowerCase().trim()));
                const hasTechTerm = containsTechTerms(firstLine);
                if (!hasSkillWord && !hasTechTerm) {
                  const capitalCount = words.filter(w => /^[A-Z]/.test(w)).length;
                  const allCapsCount = words.filter(w => w === w.toUpperCase() && w.length > 1).length;
                  const capitalRatio = capitalCount / words.length;
                  const isAllCaps = allCapsCount === words.length && words.length >= 2;
                  if ((capitalRatio >= 0.7 || isAllCaps) && !/\d{2,}/.test(firstLine) && !isBad(firstLine)) {
                    return formatName(firstLine);
                  }
                }
              }
            }
          }
        }

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
            return formatName(line);
          }
        }

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
              return formatName(line);
            }
          }
        }

        for (let i = 0; i < Math.min(8, lines.length); i++) {
          const line = lines[i];
          if (isBad(line) || line.length < 3 || line.length > 80) continue;
          const words = line.split(/\s+/).filter(w => w.length > 0);
          if (words.length >= 2 && words.length <= 5) {
            const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
            if (!allAlpha) continue;
            const allUpper = words.every(w => w === w.toUpperCase() && w.length > 1);
            const titleCase = words.every(w => /^[A-Z][a-z]+$/.test(w));
            const mostlyCap = words.filter(w => /^[A-Z]/.test(w)).length >= words.length * 0.6;
            if ((allUpper || titleCase || mostlyCap) && !/\d/.test(line) && !/@/.test(line)) {
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
            return formatName(collected.join(' '));
          }
        }

        const firstBlock = lines.slice(0, 5).join(' ');
        const multiWordRx = /\b([A-Z][A-Za-z'.-]{1,})(?:\s+[A-Z][A-Za-z'.-]{1,}){1,3}\b/g;
        for (const match of firstBlock.matchAll(multiWordRx)) {
          const candidate = match[0].trim();
          if (isBad(candidate) || candidate.length > 60) continue;
          const words = candidate.split(/\s+/).filter(w => w.length > 0);
          if (words.length < 2 || words.length > 4) continue;
          if (words.some(w => w.length < 2)) continue;
          if (words.some(w => /[.,;:!?\-]{2,}/.test(w))) continue;
          if (isBad(candidate)) continue;
          return formatName(candidate);
        }

        if (email) {
          const emailIndex = lines.findIndex(l => l.includes(email));
          if (emailIndex > 0) {
            const beforeEmail = lines[emailIndex - 1];
            if (beforeEmail && !isBad(beforeEmail) && beforeEmail.length >= 3 && beforeEmail.length <= 80) {
              const words = beforeEmail.split(/\s+/).filter(w => w.length > 0);
              if (words.length >= 2 && words.length <= 5) {
                const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
                if (allAlpha && !/@/.test(beforeEmail) && !/\d{2,}/.test(beforeEmail)) {
                  return formatName(beforeEmail);
                }
              }
            }
          }
        }

        if (email) {
          const prefix = email.split('@')[0];
          const parts = prefix.split(/[._-]+/).filter(p => p.length >= 2 && /^[a-z]+$/i.test(p));
          if (parts.length >= 2 && parts.length <= 3) {
            const raw = parts.join(' ');
            return formatName(raw);
          }
        }

        const fallback = fileName
          .replace(/\.(pdf|docx)$/i, '')
          .replace(/^\d+_\d+_\d*_?/, '')
          .replace(/[_-]+/g, ' ')
          .replace(/\b(resume|cv|curriculum|vitae|_)\b/ig, '')
          .trim();

        if (fallback && fallback.length >= 2) {
          return formatName(fallback);
        }

        return fileName;
      };

      const extractEmailAndPhone = (text: string): { email: string | null; phone: string | null } => {
        // Extract email (more comprehensive pattern)
        const emailPatterns = [
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
          /\b[\w.%+-]+@[\w.-]+\.\w{2,}\b/gi,
        ];

        let email: string | null = null;
        for (const pattern of emailPatterns) {
          const matches = text.match(pattern);
          if (matches && matches.length > 0) {
            // Filter out common false positives
            const validEmail = matches.find(e =>
              !e.includes('example.com') &&
              !e.includes('test.com') &&
              !e.includes('@resume.imported') &&
              !e.includes('@email.com')
            );
            if (validEmail) {
              email = validEmail.toLowerCase();
              break;
            }
          }
        }

        // Extract phone (various formats including Indian numbers)
        const phonePatterns = [
          // Indian format: +91 9876543210 or 91 9876543210
          /(\+?91[\s.-]?[6-9]\d{9})/g,
          // International: +1 234 567 8900
          /(\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9})/g,
          // Standard: (123) 456-7890 or 123-456-7890
          /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
          // 10-15 digit numbers
          /(\+?\d{10,15})/g,
          // With spaces/dashes: 123 456 7890
          /(\d{3}[\s.-]\d{3}[\s.-]\d{4})/g,
        ];

        let phone: string | null = null;
        for (const pattern of phonePatterns) {
          const matches = text.match(pattern);
          if (matches && matches.length > 0) {
            // Take the first match and clean it up
            let cleaned = matches[0].replace(/[\s().-]/g, '');

            // Handle Indian numbers (91 prefix)
            if (cleaned.startsWith('91') && cleaned.length === 12) {
              phone = '+' + cleaned;
            } else if (cleaned.length >= 10) {
              // Add + if it's a long number and doesn't have it
              if (!cleaned.startsWith('+') && cleaned.length >= 10) {
                // Check if it starts with country code
                if (cleaned.startsWith('91') && cleaned.length === 12) {
                  phone = '+' + cleaned;
                } else if (cleaned.length === 10) {
                  // Likely Indian number without country code
                  phone = '+91' + cleaned;
                } else {
                  phone = '+' + cleaned;
                }
              } else {
                phone = cleaned;
              }
            }

            if (phone) break;
          }
        }

        return { email, phone };
      };

      // Step 4: Process ALL storage files and extract name, email, phone for each one
      const storageOnlyFiles: Array<{ resumeUrl: string; fileInfo: { name: string; created_at: string; bucket: string } }> = [];

      for (const [resumeUrl, fileInfo] of storageFiles.entries()) {
        // Skip if this file was deleted (check by resumeUrl, filename, and bucket/filename combination)
        const isDeleted = deletedFiles.has(resumeUrl) ||
          deletedFiles.has(fileInfo.name) ||
          deletedFiles.has(`${fileInfo.bucket}/${fileInfo.name}`) ||
          deletedFiles.has(`${fileInfo.bucket}-${fileInfo.name}`);

        if (isDeleted) {
          console.log(`Skipping deleted file: ${fileInfo.name}`);
          continue;
        }

        // Check if this file already has a candidate entry by filename
        const existingCandidate = candidatesByFilename.get(fileInfo.name) ||
          candidatesByResumeUrl.get(resumeUrl) ||
          candidatesByResumeUrl.get(fileInfo.name);

        if (!existingCandidate) {
          storageOnlyFiles.push({ resumeUrl, fileInfo });
        }
      }

      // Process ALL files in batches to extract details (process 20 at a time to avoid blocking UI)
      const BATCH_SIZE = 20;
      const totalFiles = storageOnlyFiles.length;

      console.log(`Processing ${totalFiles} storage files in batches of ${BATCH_SIZE}...`);

      // Process all files in batches
      for (let batchStart = 0; batchStart < totalFiles; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalFiles);
        const batch = storageOnlyFiles.slice(batchStart, batchEnd);

        const extractionPromises = batch.map(async ({ resumeUrl, fileInfo }) => {
          // Extract name from filename as fallback
          const nameMatch = fileInfo.name.match(/\d+_\d+_(.+?)\.pdf$/i);
          let extractedName = 'Unknown';

          if (nameMatch && nameMatch[1]) {
            extractedName = nameMatch[1]
              .replace(/[-_]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          } else {
            extractedName = fileInfo.name
              .replace(/\.pdf$/i, '')
              .replace(/[-_]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          }

          // Try to extract name, email and phone from the PDF
          let finalExtractedName = extractedName;
          let extractedEmail: string | null = null;
          let extractedPhone: string | null = null;

          try {
            // Extract text (will get first page or limited text)
            const resumeText = await extractTextFromSupabaseStorage(supabase, fileInfo.bucket, fileInfo.name);

            // Extract email and phone first (needed for name extraction)
            const { email, phone } = extractEmailAndPhone(resumeText);
            extractedEmail = email;
            extractedPhone = phone;

            // Extract name from PDF text using matching engine logic (more accurate than filename)
            const pdfName = extractCandidateName(resumeText, email, fileInfo.name);
            if (pdfName && pdfName.length > 2) {
              finalExtractedName = pdfName;
            }
          } catch (err) {
            // If extraction fails, continue with filename-based name
            console.warn(`Could not extract data from ${fileInfo.name}:`, err);
          }

          return {
            id: `storage-${fileInfo.bucket}-${fileInfo.name}`,
            full_name: finalExtractedName || 'Unknown',
            email: extractedEmail,
            phone: extractedPhone,
            status: 'Pending' as const,
            created_at: fileInfo.created_at,
            job_id: null,
            resume_url: resumeUrl,
            matches: null
          } as RawCandidate;
        });

        // Wait for this batch to complete before processing next batch
        const batchResults = await Promise.allSettled(extractionPromises);
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            allCandidates.push(result.value);
          } else {
            // If extraction failed, still add the candidate with filename-based name
            const index = batchResults.indexOf(result);
            if (index >= 0 && index < batch.length) {
              const { resumeUrl, fileInfo } = batch[index];
              const nameMatch = fileInfo.name.match(/\d+_\d+_(.+?)\.pdf$/i);
              let extractedName = 'Unknown';

              if (nameMatch && nameMatch[1]) {
                extractedName = nameMatch[1].replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
              } else {
                extractedName = fileInfo.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
              }

              allCandidates.push({
                id: `storage-${fileInfo.bucket}-${fileInfo.name}`,
                full_name: extractedName || 'Unknown',
                email: null,
                phone: null,
                status: 'Pending',
                created_at: fileInfo.created_at,
                job_id: null,
                resume_url: resumeUrl,
                matches: null
              } as RawCandidate);
            }
          }
        }

        // Log progress
        if (batchEnd % (BATCH_SIZE * 5) === 0 || batchEnd === totalFiles) {
          console.log(`Processed ${batchEnd} of ${totalFiles} files...`);
        }
      }

      console.log(`✅ Completed processing all ${totalFiles} storage files`);

      // Step 5: Final deduplication
      const uniqueCandidatesMap = new Map<string, RawCandidate>();
      for (const candidate of allCandidates) {
        const key = candidate.id || candidate.resume_url || '';
        if (key && !uniqueCandidatesMap.has(key)) {
          uniqueCandidatesMap.set(key, candidate);
        }
      }

      // Sort by created_at (most recent first)
      return Array.from(uniqueCandidatesMap.values()).sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });
    },
  });

  const jobMap = useMemo(() => {
    const map = new Map<string, string>();
    (jobList as JobInfo[]).forEach((job) => {
      if (job?.id) {
        map.set(job.id, job.job_title ?? "Untitled Role");
      }
    });
    return map;
  }, [jobList]);

  const latestCandidates: CandidateRow[] = useMemo(() => {
    // Step 1: Deduplicate by ID first
    const seenIds = new Set<string>();
    const candidatesById = (latestCandidatesRaw as RawCandidate[]).filter((candidate) => {
      if (!candidate.id || seenIds.has(candidate.id)) {
        return false;
      }
      seenIds.add(candidate.id);
      return true;
    });

    // Step 2: Sort by created_at DESC to prioritize most recent
    const sortedCandidates = [...candidatesById].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA; // Most recent first
    });

    // Step 3: Deduplicate by normalized name (same person, different uploads)
    const seenNames = new Map<string, RawCandidate>();
    const uniqueByName: RawCandidate[] = [];

    for (const candidate of sortedCandidates) {
      // Normalize name: lowercase, trim, remove extra spaces, remove common suffixes and variations
      const normalizeName = (name: string | null): string | null => {
        if (!name) return null;
        let normalized = name
          .trim()
          .toLowerCase();

        // Replace underscores, hyphens, and special characters with spaces
        normalized = normalized.replace(/[_\-\s]+/g, ' ');

        // Ensure single spaces
        normalized = normalized.replace(/\s+/g, ' ').trim();

        // Remove common company/organization names and suffixes
        const removePatterns = [
          /\s*(resume|cv|curriculum|vitae)\s*(\d+)?\s*$/i,
          /\s*(updated|final|draft|version|revised|edited)\s*(\d+)?\s*$/i,
          /\s*(techvitta|tech\s*vitta|company|corp|inc|llc|ltd)\s*/gi,
          /\s*(updatedcgpa|cgpa|gpa)\s*/gi,
          /\s*\d+\s*$/, // Trailing numbers
        ];

        for (const pattern of removePatterns) {
          normalized = normalized.replace(pattern, ' ');
        }

        // Remove any remaining trailing numbers and separators
        normalized = normalized.replace(/\s*[-_\s]*\d+\s*$/, '');

        // Remove common prefixes
        normalized = normalized.replace(/^(mr|mrs|ms|miss|dr|prof)\s+/i, '');

        // Clean up multiple spaces again
        normalized = normalized.replace(/\s+/g, ' ').trim();

        return normalized.trim();
      };

      const normalizedName = normalizeName(candidate.full_name);

      if (normalizedName) {
        const existing = seenNames.get(normalizedName);
        if (existing) {
          // Keep the one with more recent created_at or better email
          const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;
          const currentTime = candidate.created_at ? new Date(candidate.created_at).getTime() : 0;
          const existingHasRealEmail = existing.email &&
            !existing.email.includes('@resume.imported') &&
            !existing.email.includes('@email.com');
          const currentHasRealEmail = candidate.email &&
            !candidate.email.includes('@resume.imported') &&
            !candidate.email.includes('@email.com');

          // Prefer: real email > most recent
          if (currentHasRealEmail && !existingHasRealEmail) {
            // Replace with one that has real email
            const oldIndex = uniqueByName.findIndex(c => c.id === existing.id);
            if (oldIndex >= 0) uniqueByName.splice(oldIndex, 1);
            seenNames.set(normalizedName, candidate);
            uniqueByName.push(candidate);
          } else if (!currentHasRealEmail && existingHasRealEmail) {
            // Keep existing one with real email
            continue;
          } else if (currentTime > existingTime) {
            // Both have same email type, keep most recent
            const oldIndex = uniqueByName.findIndex(c => c.id === existing.id);
            if (oldIndex >= 0) uniqueByName.splice(oldIndex, 1);
            seenNames.set(normalizedName, candidate);
            uniqueByName.push(candidate);
          } else {
            // Skip this duplicate
            continue;
          }
        } else {
          seenNames.set(normalizedName, candidate);
          uniqueByName.push(candidate);
        }
      } else {
        // No name, add anyway
        uniqueByName.push(candidate);
      }
    }

    // Step 4: Deduplicate by resume_url (same file uploaded multiple times)
    const seenUrls = new Map<string, RawCandidate>();
    const finalCandidates: RawCandidate[] = [];

    for (const candidate of uniqueByName) {
      if (candidate.resume_url) {
        const existing = seenUrls.get(candidate.resume_url);
        if (existing) {
          // Keep the most recent
          const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;
          const currentTime = candidate.created_at ? new Date(candidate.created_at).getTime() : 0;
          if (currentTime > existingTime) {
            const oldIndex = finalCandidates.findIndex(c => c.id === existing.id);
            if (oldIndex >= 0) finalCandidates.splice(oldIndex, 1);
            seenUrls.set(candidate.resume_url, candidate);
            finalCandidates.push(candidate);
          }
          // else skip this duplicate
        } else {
          seenUrls.set(candidate.resume_url, candidate);
          finalCandidates.push(candidate);
        }
      } else {
        finalCandidates.push(candidate);
      }
    }

    const visibleCandidates = finalCandidates.filter((candidate) => {
      const normalizedStatus = (candidate.status || "").toLowerCase().replace(/\s+/g, " ").trim();
      return normalizedStatus !== "offer released" && normalizedStatus !== "offer_released";
    });

    return visibleCandidates.map((candidate) => {
      const matches = Array.isArray(candidate.matches) ? candidate.matches : [];
      const bestMatch = matches.reduce<CandidateMatch | null>((best, current) => {
        const currentScore =
          current && typeof current.match_score === "number" ? current.match_score : -1;
        const bestScore =
          best && typeof best.match_score === "number" ? best.match_score : -1;
        return currentScore > bestScore ? current : best;
      }, null);

      const jobFromCandidate = candidate.job_id ? jobMap.get(candidate.job_id) : undefined;
      const jobFromMatch = bestMatch?.job_id ? jobMap.get(bestMatch.job_id) : undefined;
      const jobApplied = jobFromCandidate ?? jobFromMatch ?? "—";

      const createdLabel = candidate.created_at
        ? formatDistanceToNow(new Date(candidate.created_at), { addSuffix: true })
        : null;

      return {
        id: candidate.id,
        name: candidate.full_name ?? "Unknown",
        email: candidate.email ?? "—",
        phone: candidate.phone ?? "—",
        status: candidate.status ?? "Pending",
        jobApplied,
        createdAt: candidate.created_at,
        createdLabel,
        resumeUrl: candidate.resume_url,
        referenceSource: candidate.reference_source ?? null,
      };
    });
  }, [jobMap, latestCandidatesRaw]);

  const totalDashboardCandidates = latestCandidates.length;

  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [jobFilter, setJobFilter] = useState("all");

  const jobOptions = useMemo(() => {
    const unique = new Set<string>();
    latestCandidates.forEach((candidate) => {
      if (candidate.jobApplied && candidate.jobApplied !== "—") {
        unique.add(candidate.jobApplied);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [latestCandidates]);

  const filteredCandidates = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const now = Date.now();

    const filtered = latestCandidates.filter((candidate) => {
      const matchesSearch =
        search.length === 0 ||
        [candidate.name, candidate.email, candidate.phone, candidate.jobApplied]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(search));

      const matchesJob =
        jobFilter === "all" ||
        (jobFilter === "no-job" && candidate.jobApplied === "—") ||
        candidate.jobApplied === jobFilter;

      const matchesStage = (() => {
        if (stageFilter.length === 0) return true;
        const status = candidate.status?.toLowerCase() || "pending";

        return stageFilter.some((filter) => {
          switch (filter) {
            case "Applied":
              return status === "pending" || !candidate.status;
            case "Shortlisted":
              return status.includes("shortlist");
            case "Rejected":
              return status.includes("reject");
            case "Interview Scheduled":
              return status.includes("interview");
            case "Approved":
              return status.includes("approve");
            default:
              return false;
          }
        });
      })();

      const matchesDate = (() => {
        if (dateFilter === "all") return true;
        if (!candidate.createdAt) return false;
        const createdTime = new Date(candidate.createdAt).getTime();
        const diffDays = (now - createdTime) / (1000 * 60 * 60 * 24);

        switch (dateFilter) {
          case "7":
            return diffDays <= 7;
          case "30":
            return diffDays <= 30;
          case "90":
            return diffDays <= 90;
          default:
            return true;
        }
      })();

      return matchesSearch && matchesJob && matchesStage && matchesDate;
    });

    // Final deduplication by ID, email, and normalized name to ensure no duplicates
    const seenIds = new Set<string>();
    const seenEmails = new Map<string, CandidateRow>();
    const seenNormalizedNames = new Map<string, CandidateRow>();

    return filtered.filter((candidate) => {
      // Deduplicate by ID first
      if (seenIds.has(candidate.id)) {
        return false;
      }
      seenIds.add(candidate.id);

      // Deduplicate by email (if email exists and is valid)
      const candidateEmail = candidate.email && candidate.email !== "—"
        ? candidate.email.toLowerCase().trim()
        : null;

      if (candidateEmail && candidateEmail.length > 0) {
        const existingByEmail = seenEmails.get(candidateEmail);

        if (existingByEmail) {
          // If we already have this email, keep the one with better data
          const existingTime = existingByEmail.createdAt ? new Date(existingByEmail.createdAt).getTime() : 0;
          const currentTime = candidate.createdAt ? new Date(candidate.createdAt).getTime() : 0;

          // Keep the most recent one
          if (currentTime > existingTime) {
            // Replace with more recent one
            seenEmails.set(candidateEmail, candidate);
            // Also update normalized name map if needed
            const normalizeForDedup = (name: string): string => {
              let normalized = name.toLowerCase().trim();
              normalized = normalized.replace(/[_\-\s]+/g, ' ').replace(/\s+/g, ' ').trim();
              normalized = normalized.replace(/\s*(resume|cv|curriculum|vitae|updated|final|draft|version|revised|edited)\s*(\d+)?\s*$/i, '');
              normalized = normalized.replace(/\s*(techvitta|tech\s*vitta|company|corp|inc|llc|ltd|updatedcgpa|cgpa|gpa)\s*/gi, '');
              normalized = normalized.replace(/\s*\d+\s*$/, '');
              return normalized.replace(/\s+/g, ' ').trim();
            };
            const normalizedName = normalizeForDedup(candidate.name);
            if (normalizedName) {
              seenNormalizedNames.set(normalizedName, candidate);
            }
            return true;
          }
          // Skip this duplicate (keep existing one)
          return false;
        }

        // New email, add it
        seenEmails.set(candidateEmail, candidate);
      }

      // Additional deduplication by normalized name (for cases without email)
      const normalizeForDedup = (name: string): string => {
        let normalized = name.toLowerCase().trim();

        // Replace underscores, hyphens with spaces
        normalized = normalized.replace(/[_\-\s]+/g, ' ');
        normalized = normalized.replace(/\s+/g, ' ').trim();

        // Remove common suffixes and company names
        normalized = normalized.replace(/\s*(resume|cv|curriculum|vitae|updated|final|draft|version|revised|edited)\s*(\d+)?\s*$/i, '');
        normalized = normalized.replace(/\s*(techvitta|tech\s*vitta|company|corp|inc|llc|ltd|updatedcgpa|cgpa|gpa)\s*/gi, '');
        normalized = normalized.replace(/\s*\d+\s*$/, ''); // Trailing numbers
        normalized = normalized.replace(/\s+/g, ' ').trim();

        return normalized;
      };

      const normalizedName = normalizeForDedup(candidate.name);
      const existing = seenNormalizedNames.get(normalizedName);

      if (existing) {
        // If we already have this normalized name, keep the one with better data
        const existingHasEmail = existing.email && existing.email !== "—" && !existing.email.includes('@resume.imported') && !existing.email.includes('@email.com');
        const currentHasEmail = candidate.email && candidate.email !== "—" && !candidate.email.includes('@resume.imported') && !candidate.email.includes('@email.com');

        // Also check creation date to keep most recent
        const existingTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
        const currentTime = candidate.createdAt ? new Date(candidate.createdAt).getTime() : 0;

        if (currentHasEmail && !existingHasEmail) {
          // Replace with one that has real email
          seenNormalizedNames.set(normalizedName, candidate);
          return true;
        } else if (!currentHasEmail && existingHasEmail) {
          // Keep existing one with real email
          return false;
        } else if (currentTime > existingTime) {
          // Both have same email type, keep most recent
          seenNormalizedNames.set(normalizedName, candidate);
          return true;
        }
        // Skip this duplicate
        return false;
      }

      seenNormalizedNames.set(normalizedName, candidate);
      return true;
    });
  }, [dateFilter, stageFilter, jobFilter, latestCandidates, searchTerm]);


  const formatStatus = (status: string) => {
    if (!status) return "Pending";
    return status
      .toLowerCase()
      .replace(/_/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getStatusBadgeClass = (status: string) => {
    const key = status.toLowerCase();
    if (key.includes("interview")) return "bg-amber-100 text-amber-700 border-none";
    if (key.includes("shortlist")) return "bg-blue-100 text-blue-700 border-none";
    if (key.includes("approve")) return "bg-emerald-100 text-emerald-700 border-none";
    if (key.includes("reject")) return "bg-rose-100 text-rose-700 border-none";
    return "bg-slate-100 text-slate-700 border-none";
  };

  const getInitials = (value: string) => {
    if (!value) return "NA";
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "NA";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  };

  const handleViewResume = (resumeUrl: string | null) => {
    if (!resumeUrl) {
      toast({
        title: "Resume not available",
        description: "Resume URL is not available for this candidate.",
        variant: "destructive",
      });
      return;
    }
    openResume(resumeUrl);
  };

  const handleJobsCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate("/recruitment-hub");
    }
  };

  const handleEditClick = async (candidate: CandidateRow) => {
    setEditingCandidate(candidate);
    setEditForm({
      name: candidate.name === "Unknown" ? "" : candidate.name,
      email: candidate.email === "—" ? "" : candidate.email,
      phone: candidate.phone === "—" ? "" : candidate.phone,
      referenceSource: candidate.referenceSource || "",
    });
    setEditDialogOpen(true);

    // Check if resume request email was already sent
    const email = candidate.email !== "—" ? candidate.email : "";
    if (email) {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("action", "REQUEST_RESUME_EMAIL_SENT")
        .ilike("details", `%${email}%`)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const sentDate = new Date(data[0].created_at);
        setLastResumeRequestSent({
          date: sentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          time: sentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        });
      } else {
        setLastResumeRequestSent(null);
      }
    } else {
      setLastResumeRequestSent(null);
    }
  };

  const handleViewResumeRequestHistory = async () => {
    if (!editingCandidate) return;

    const email = (editForm.email || editingCandidate.email || "").trim();
    if (!email) {
      toast({
        title: "Email Required",
        description: "Candidate email is required to view history.",
        variant: "destructive",
      });
      return;
    }

    setResumeRequestHistoryOpen(true);
    setResumeRequestHistoryLoading(true);

    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("action", "REQUEST_RESUME_EMAIL_SENT")
      .ilike("details", `%${email}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to load resume request history:", error);
      toast({
        title: "Error",
        description: "Failed to load resume request email history.",
        variant: "destructive",
      });
      setResumeRequestHistoryEntries([]);
    } else {
      setResumeRequestHistoryEntries((data || []) as any[]);
    }

    setResumeRequestHistoryLoading(false);
  };

  const handleStatusUpdate = async (candidate: CandidateRow, newStatus: string) => {
    try {
      // If it's a storage-only candidate, create a database entry first
      if (candidate.id.startsWith('storage-')) {
        // Extract resume URL from the candidate
        let resumeUrl = candidate.resumeUrl;

        if (!resumeUrl) {
          // Extract resume_url from the storage ID
          const withoutPrefix = candidate.id.replace('storage-', '');
          const knownBuckets = STORAGE_BUCKETS;
          let bucket = 'resumes-private'; // default
          let filename = withoutPrefix;

          for (const knownBucket of knownBuckets) {
            if (withoutPrefix.startsWith(knownBucket + '-')) {
              bucket = knownBucket;
              filename = withoutPrefix.substring(knownBucket.length + 1);
              break;
            }
          }

          resumeUrl = `${bucket}/${filename}`;
        }

        // Create a new candidate entry in the database
        const { data: newCandidate, error: insertError } = await supabase
          .from('candidates')
          .insert({
            full_name: candidate.name,
            email: candidate.email !== "—" ? candidate.email.toLowerCase() : null,
            phone: candidate.phone !== "—" ? candidate.phone : null,
            resume_url: resumeUrl,
            status: newStatus,
            resume_processed: false,
            job_id: null,
          })
          .select('id')
          .single();

        if (insertError) {
          // If it's a duplicate email error, try to update instead
          if (insertError.code === '23505' || insertError.message.includes('duplicate')) {
            const { data: existing, error: findError } = await supabase
              .from('candidates')
              .select('id')
              .eq('email', candidate.email !== "—" ? candidate.email.toLowerCase() : null)
              .maybeSingle();

            if (!findError && existing) {
              // Update existing candidate
              const { error: updateError } = await supabase
                .from('candidates')
                .update({
                  status: newStatus,
                  full_name: candidate.name,
                  phone: candidate.phone !== "—" ? candidate.phone : null,
                  resume_url: resumeUrl,
                })
                .eq('id', existing.id);

              if (updateError) throw updateError;
            } else {
              throw insertError;
            }
          } else {
            throw insertError;
          }
        }
      } else {
        // Update existing candidate status
        const { error: updateError } = await supabase
          .from('candidates')
          .update({ status: newStatus })
          .eq('id', candidate.id);

        if (updateError) {
          throw updateError;
        }
      }

      toast({
        title: "Status Updated",
        description: `Candidate status updated to ${newStatus}.`,
      });

      // Refresh the candidates list immediately
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });
      await queryClient.refetchQueries({ queryKey: ["all-candidates-with-storage"] });
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update candidate status.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = async (candidate: CandidateRow) => {
    console.log("Delete clicked for candidate:", candidate.id, candidate.name);
    setDeleting(true);

    try {
      let resumeUrlToDelete: string | null = null;
      let resumeHashToDelete: string | null = null;
      let bucket = '';
      let path = '';
      let fileDeleted = false;
      let dbDeleted = false;
      const bucketHints = new Set<string>();
      let filenameFromSource: string | null = null;

      if (candidate.id.startsWith('storage-')) {
        console.log("Deleting storage-only candidate");
        const withoutPrefix = candidate.id.replace('storage-', '');
        for (const knownBucket of STORAGE_BUCKETS) {
          const prefix = `${knownBucket}-`;
          if (withoutPrefix.startsWith(prefix)) {
            bucket = knownBucket;
            path = withoutPrefix.substring(prefix.length);
            bucketHints.add(knownBucket);
            break;
          }
        }

        if (!bucket || !path) {
          const parsed = parseStorageLocation(candidate.resumeUrl);
          if (parsed.bucket && parsed.path) {
            bucket = parsed.bucket;
            path = parsed.path;
            bucketHints.add(parsed.bucket);
          }
          if (parsed.normalized) {
            resumeUrlToDelete = parsed.normalized;
          }
          if (parsed.filename) {
            filenameFromSource = parsed.filename;
          }
        } else {
          resumeUrlToDelete = `${bucket}/${path}`;
          filenameFromSource = path.split('/').pop() || path;
        }

        if (path || filenameFromSource) {
          try {
            const { data: hashData } = await supabase
              .from("resume_upload_hashes")
              .select("file_hash")
              .ilike("original_name", `%${filenameFromSource || path}%`)
              .maybeSingle();

            if (hashData) {
              resumeHashToDelete = hashData.file_hash;
            }
          } catch (hashError) {
            console.warn("Error fetching hash:", hashError);
          }
        }
      } else {
        console.log("Deleting database candidate");
        const { data: candidateData, error: fetchError } = await supabase
          .from("candidates")
          .select("resume_url, resume_hash")
          .eq("id", candidate.id)
          .maybeSingle();

        if (fetchError) {
          console.warn("Error fetching candidate data:", fetchError);
        }

        if (candidateData) {
          const parsed = parseStorageLocation(candidateData.resume_url);
          if (parsed.bucket && parsed.path) {
            bucket = parsed.bucket;
            path = parsed.path;
            bucketHints.add(parsed.bucket);
          }
          if (parsed.filename) {
            filenameFromSource = parsed.filename;
          }
          resumeUrlToDelete = parsed.normalized || candidateData.resume_url;
          resumeHashToDelete = candidateData.resume_hash;
        }

        const { error: deleteError } = await supabase
          .from("candidates")
          .delete()
          .eq("id", candidate.id);

        if (deleteError) {
          console.error("Database delete error:", deleteError);
          throw deleteError;
        }
        dbDeleted = true;
        console.log("Candidate deleted from database");

        if (resumeHashToDelete) {
          const { error: deleteHashError } = await supabase
            .from("resume_upload_hashes")
            .delete()
            .eq("file_hash", resumeHashToDelete);

          if (deleteHashError) {
            console.warn("Error deleting hash:", deleteHashError.message);
          }
        }
      }

      if (resumeUrlToDelete && (!bucket || !path)) {
        const parsed = parseStorageLocation(resumeUrlToDelete);
        if (parsed.bucket && parsed.path) {
          bucket = parsed.bucket;
          path = parsed.path;
          bucketHints.add(parsed.bucket);
        }
        if (parsed.filename) {
          filenameFromSource = parsed.filename;
        }
      }

      const pathVariantsSet = new Set<string>();
      buildPathVariants(path, filenameFromSource).forEach((variant) => pathVariantsSet.add(variant));

      if (resumeUrlToDelete && pathVariantsSet.size === 0) {
        const fallbackParsed = parseStorageLocation(resumeUrlToDelete);
        buildPathVariants(fallbackParsed.path, fallbackParsed.filename).forEach((variant) =>
          pathVariantsSet.add(variant)
        );
      }

      const pathVariants = Array.from(pathVariantsSet);
      const bucketsToTry = bucketHints.size > 0 ? Array.from(bucketHints) : STORAGE_BUCKETS;

      if (pathVariants.length > 0) {
        try {
          for (const bucketName of bucketsToTry) {
            for (const candidatePath of pathVariants) {
              if (!candidatePath) continue;
              console.log(`Attempting to delete file: ${bucketName}/${candidatePath}`);
              const { error: deleteError } = await supabase.storage
                .from(bucketName)
                .remove([candidatePath]);

              if (deleteError) {
                console.warn(`Deletion failed for ${bucketName}/${candidatePath}:`, deleteError.message);
                continue;
              }

              bucket = bucketName;
              path = candidatePath;
              fileDeleted = true;
              break;
            }
            if (fileDeleted) break;
          }

          if (!fileDeleted) {
            const errorMessage = "Failed to delete resume file from storage.";
            console.error(errorMessage);
            if (candidate.id.startsWith('storage-')) {
              throw new Error(errorMessage);
            }
          }
        } catch (fileError: any) {
          console.error("Error deleting resume file:", fileError);
          if (candidate.id.startsWith('storage-')) {
            throw fileError;
          }
        }
      } else if (candidate.id.startsWith('storage-')) {
        console.warn("Could not determine any storage path variants for deletion.");
      }

      if (fileDeleted && bucket && path) {
        console.log(`✅ Successfully deleted file: ${bucket}/${path}`);

        // Store deleted file identifiers in localStorage to prevent re-importing
        try {
          const stored = localStorage.getItem('deleted-resume-files');
          const deletedSet = stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();

          // Store multiple identifiers to catch all variations
          const filename = path.split('/').pop() || path;
          deletedSet.add(`${bucket}/${path}`);
          deletedSet.add(`${bucket}/${filename}`);
          deletedSet.add(`${bucket}-${filename}`);
          deletedSet.add(filename);
          if (resumeUrlToDelete) {
            deletedSet.add(resumeUrlToDelete);
            const parsed = parseStorageLocation(resumeUrlToDelete);
            if (parsed.normalized) deletedSet.add(parsed.normalized);
            if (parsed.filename) deletedSet.add(parsed.filename);
          }

          // Limit to last 1000 deleted files to prevent localStorage from growing too large
          const deletedArray = Array.from(deletedSet).slice(-1000);
          localStorage.setItem('deleted-resume-files', JSON.stringify(deletedArray));
          console.log(`✅ Stored deleted file identifiers in localStorage`);
        } catch (storageError) {
          console.warn("Could not store deleted file in localStorage:", storageError);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const { data: verifyFiles } = await supabase.storage
            .from(bucket)
            .list('', { limit: 10000 });

          const stillExists = verifyFiles?.some((f) => f.name === path);
          if (stillExists) {
            console.warn(`⚠️ File ${path} still exists after deletion attempt`);
          } else {
            console.log(`✅ Verified: File ${path} no longer exists in ${bucket}`);
          }
        } catch (verifyError) {
          console.warn("Could not verify file deletion:", verifyError);
        }
      }

      // Delete hash from resume_upload_hashes for storage-only candidates
      if (candidate.id.startsWith('storage-') && resumeHashToDelete) {
        const { error: hashDeleteError } = await supabase
          .from("resume_upload_hashes")
          .delete()
          .eq("file_hash", resumeHashToDelete);

        if (hashDeleteError) {
          console.warn("Error deleting hash:", hashDeleteError);
        } else {
          console.log("✅ Deleted hash from resume_upload_hashes");
        }
      }

      // For storage-only candidates, ensure file was deleted
      if (candidate.id.startsWith('storage-') && !fileDeleted && candidate.resumeUrl) {
        throw new Error("Failed to delete storage file. Candidate will reappear on refresh.");
      }

      // Store deleted identifiers even if file deletion failed (for database candidates)
      // This prevents the file from being re-imported if it still exists in storage
      if (dbDeleted && (resumeUrlToDelete || candidate.resumeUrl)) {
        try {
          const stored = localStorage.getItem('deleted-resume-files');
          const deletedSet = stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();

          const urlToUse = resumeUrlToDelete || candidate.resumeUrl || '';
          if (urlToUse) {
            const parsed = parseStorageLocation(urlToUse);
            if (parsed.normalized) deletedSet.add(parsed.normalized);
            if (parsed.filename) {
              deletedSet.add(parsed.filename);
              for (const bucketName of STORAGE_BUCKETS) {
                deletedSet.add(`${bucketName}/${parsed.filename}`);
                deletedSet.add(`${bucketName}-${parsed.filename}`);
              }
            }
            deletedSet.add(urlToUse);
          }

          const deletedArray = Array.from(deletedSet).slice(-1000);
          localStorage.setItem('deleted-resume-files', JSON.stringify(deletedArray));
          console.log(`✅ Stored deleted candidate identifiers in localStorage`);
        } catch (storageError) {
          console.warn("Could not store deleted candidate in localStorage:", storageError);
        }
      }

      console.log("Deletion operations completed, updating UI...");

      // Update UI immediately by removing from cache (optimistic update)
      // This ensures the candidate disappears from the UI instantly
      queryClient.setQueryData(['all-candidates-with-storage'], (oldData: RawCandidate[] | undefined) => {
        if (!oldData) return oldData;
        const filtered = oldData.filter((c: RawCandidate) => {
          // Remove by ID match
          if (c.id === candidate.id) return false;
          // Also remove if it's a storage candidate with same resumeUrl (to handle edge cases)
          if (candidate.id.startsWith('storage-') && c.id.startsWith('storage-') && c.resume_url === candidate.resumeUrl) {
            return false;
          }
          return true;
        });
        console.log(`UI update: Removed candidate. Old count: ${oldData.length}, New count: ${filtered.length}`);
        return filtered;
      });

      // Wait longer to ensure database/storage operations have fully propagated
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Invalidate and refetch to ensure data consistency
      // This ensures deleted candidates don't reappear on refresh
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });

      try {
        const refetchResult = await refetchCandidates();
        console.log("Refetch completed:", refetchResult);

        // After refetch, ensure deleted candidate is still not in the list
        queryClient.setQueryData(['all-candidates-with-storage'], (currentData: RawCandidate[] | undefined) => {
          if (!currentData) return currentData;
          return currentData.filter((c: RawCandidate) => {
            // Remove by ID match
            if (c.id === candidate.id) return false;
            // Also remove if it's a storage candidate with same resumeUrl
            if (candidate.id.startsWith('storage-') && c.id.startsWith('storage-') && c.resume_url === candidate.resumeUrl) {
              return false;
            }
            return true;
          });
        });
      } catch (refetchError) {
        console.error("Refetch error:", refetchError);
      }
      toast({
        title: "Candidate Deleted",
        description: `${candidate.name} has been permanently deleted.`,
      });

      console.log("✅ Delete operation completed successfully - candidate will not reappear on refresh");
    } catch (error: any) {
      console.error("Error deleting candidate:", error);

      // Revert optimistic update on error
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });
      await refetchCandidates();

      toast({
        title: "Error",
        description: error.message || "Failed to delete candidate. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };


  const computeFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleAddCandidate = async () => {
    // Validate required fields
    if (!newCandidateForm.name.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a candidate name.",
        variant: "destructive",
      });
      return;
    }

    if (!newCandidateForm.email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter an email address.",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    const emailTrimmed = newCandidateForm.email.trim();
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    if (!emailRegex.test(emailTrimmed)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setUploadingResume(true);
    let resumeUrl: string | null = null;
    let resumeHash: string | null = null;

    try {
      // Upload resume file if provided
      if (newCandidateForm.resumeFile) {
        const file = newCandidateForm.resumeFile;

        if (!/\.pdf$/i.test(file.name)) {
          toast({
            title: "Invalid File",
            description: "Please upload a PDF file.",
            variant: "destructive",
          });
          setUploadingResume(false);
          return;
        }

        resumeHash = await computeFileHash(file);

        // Check if file already exists
        const { data: existingCandidate } = await supabase
          .from("candidates")
          .select("id, full_name")
          .eq("resume_hash", resumeHash)
          .maybeSingle();

        if (existingCandidate) {
          toast({
            title: "Resume Already Exists",
            description: `This resume matches ${existingCandidate.full_name}'s existing resume.`,
            variant: "destructive",
          });
          setUploadingResume(false);
          return;
        }

        // Upload to storage
        const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET || "resumes-private";
        const candidateBuckets = Array.from(new Set([envBucket, "resumes-private", "resumes"]));

        const timestamp = Date.now();
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const storageFileName = `${timestamp}_0_${sanitizedFileName}`;

        let uploaded = false;
        let usedBucket = "";

        for (const BUCKET_NAME of candidateBuckets) {
          const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storageFileName, file, {
              cacheControl: "3600",
              upsert: false,
              metadata: { file_hash: resumeHash, original_name: file.name },
            });

          if (!uploadError) {
            uploaded = true;
            usedBucket = BUCKET_NAME;
            resumeUrl = `${BUCKET_NAME}/${storageFileName}`;
            break;
          }
        }

        if (!uploaded) {
          toast({
            title: "Upload Failed",
            description: "Failed to upload resume file.",
            variant: "destructive",
          });
          setUploadingResume(false);
          return;
        }

        // Record hash
        const { error: hashError } = await supabase
          .from("resume_upload_hashes")
          .insert({ file_hash: resumeHash, original_name: file.name });

        if (hashError) {
          console.warn("Hash already exists or failed to record:", hashError.message);
        }
      }

      // Create candidate record - store exactly like other candidates
      const { data: newCandidate, error: insertError } = await supabase
        .from("candidates")
        .insert({
          full_name: newCandidateForm.name.trim(),
          email: emailTrimmed.toLowerCase(),
          phone: newCandidateForm.phone.trim() || null,
          status: "Pending",
          resume_url: resumeUrl,
          resume_hash: resumeHash,
          resume_processed: false,
          job_id: null,
        })
        .select()
        .single();

      if (insertError) {
        // Check if it's a duplicate email error
        if (insertError.code === "23505" && insertError.message.includes("email")) {
          // Try to update existing candidate
          const { data: updatedCandidate, error: updateError } = await supabase
            .from("candidates")
            .update({
              full_name: newCandidateForm.name.trim(),
              phone: newCandidateForm.phone.trim() || null,
              resume_url: resumeUrl || undefined,
              resume_hash: resumeHash || undefined,
              resume_processed: resumeUrl ? false : undefined, // Mark as unprocessed if new resume uploaded
            })
            .eq("email", emailTrimmed.toLowerCase())
            .select()
            .single();

          if (updateError) {
            throw updateError;
          }

          toast({
            title: "Candidate Updated",
            description: "Candidate with this email already exists. Updated the record.",
          });
        } else {
          throw insertError;
        }
      } else {
        toast({
          title: "Candidate Added",
          description: "New candidate has been added successfully.",
        });
      }

      // Reset form
      setNewCandidateForm({
        name: "",
        email: "",
        phone: "",
        resumeFile: null,
      });
      setAddCandidateDialogOpen(false);

      // Refresh the candidates list - invalidate and refetch immediately
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });

      // Force immediate refetch to show the new candidate
      await queryClient.refetchQueries({ queryKey: ["all-candidates-with-storage"] });
    } catch (error: any) {
      console.error("Error adding candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add candidate.",
        variant: "destructive",
      });
    } finally {
      setUploadingResume(false);
    }
  };

  const handleBulkUploadResumes = async () => {
    if (selectedResumeFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one PDF file to upload.",
        variant: "destructive",
      });
      return;
    }

    // Validate all files are PDFs
    const invalidFiles = selectedResumeFiles.filter(file => !/\.pdf$/i.test(file.name));
    if (invalidFiles.length > 0) {
      toast({
        title: "Invalid Files",
        description: `Please upload only PDF files. Found ${invalidFiles.length} non-PDF file(s).`,
        variant: "destructive",
      });
      return;
    }

    setUploadingResumes(true);
    setUploadProgress({ current: 0, total: selectedResumeFiles.length });

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    try {
      for (let i = 0; i < selectedResumeFiles.length; i++) {
        const file = selectedResumeFiles[i];
        setUploadProgress({ current: i + 1, total: selectedResumeFiles.length });

        try {
          // Compute file hash
          const resumeHash = await computeFileHash(file);

          // Check if file already exists
          const { data: existingCandidate } = await supabase
            .from("candidates")
            .select("id, full_name")
            .eq("resume_hash", resumeHash)
            .maybeSingle();

          if (existingCandidate) {
            results.skipped++;
            continue;
          }

          // Upload to storage
          const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET || "resumes-private";
          const candidateBuckets = Array.from(new Set([envBucket, "resumes-private", "resumes"]));

          const timestamp = Date.now();
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
          const storageFileName = `${timestamp}_${i}_${sanitizedFileName}`;

          let uploaded = false;
          let resumeUrl: string | null = null;

          for (const BUCKET_NAME of candidateBuckets) {
            const { error: uploadError } = await supabase.storage
              .from(BUCKET_NAME)
              .upload(storageFileName, file, {
                cacheControl: "3600",
                upsert: false,
                metadata: { file_hash: resumeHash, original_name: file.name },
              });

            if (!uploadError) {
              uploaded = true;
              resumeUrl = `${BUCKET_NAME}/${storageFileName}`;
              break;
            }
          }

          if (!uploaded) {
            results.failed++;
            results.errors.push(`${file.name}: Upload failed`);
            continue;
          }

          // Record hash
          const { error: hashError } = await supabase
            .from("resume_upload_hashes")
            .insert({ file_hash: resumeHash, original_name: file.name });

          if (hashError) {
            console.warn("Hash already exists or failed to record:", hashError.message);
          }

          // Extract data from PDF
          let extractedName = 'Unknown';
          let extractedEmail: string | null = null;
          let extractedPhone: string | null = null;

          try {
            // Parse resumeUrl to extract bucket and file path
            const [bucketName, ...pathParts] = resumeUrl.split('/');
            const filePath = pathParts.join('/');

            const text = await extractTextFromSupabaseStorage(supabase, bucketName, filePath);
            if (text && text.length > 10) {
              // Extract email and phone first (needed for name extraction)
              const extractEmailAndPhone = (text: string): { email: string | null; phone: string | null } => {
                const emailPatterns = [
                  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
                  /\b[\w.%+-]+@[\w.-]+\.\w{2,}\b/gi,
                ];

                let email: string | null = null;
                for (const pattern of emailPatterns) {
                  const matches = text.match(pattern);
                  if (matches && matches.length > 0) {
                    const validEmail = matches.find(e =>
                      !e.includes('example.com') &&
                      !e.includes('test.com') &&
                      !e.includes('@resume.imported') &&
                      !e.includes('@email.com')
                    );
                    if (validEmail) {
                      email = validEmail.toLowerCase();
                      break;
                    }
                  }
                }

                const phonePatterns = [
                  /(\+?91[\s.-]?[6-9]\d{9})/g,
                  /(\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9})/g,
                  /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
                  /(\+?\d{10,15})/g,
                  /(\d{3}[\s.-]\d{3}[\s.-]\d{4})/g,
                ];

                let phone: string | null = null;
                for (const pattern of phonePatterns) {
                  const matches = text.match(pattern);
                  if (matches && matches.length > 0) {
                    let cleaned = matches[0].replace(/[\s().-]/g, '');

                    if (cleaned.startsWith('91') && cleaned.length === 12) {
                      phone = '+' + cleaned;
                    } else if (cleaned.length >= 10) {
                      if (!cleaned.startsWith('+') && cleaned.length >= 10) {
                        if (cleaned.startsWith('91') && cleaned.length === 12) {
                          phone = '+' + cleaned;
                        } else if (cleaned.length === 10) {
                          phone = '+91' + cleaned;
                        } else {
                          phone = '+' + cleaned;
                        }
                      } else {
                        phone = cleaned;
                      }
                    }

                    if (phone) break;
                  }
                }

                return { email, phone };
              };

              const { email, phone } = extractEmailAndPhone(text);
              extractedEmail = email;
              extractedPhone = phone;

              // Extract name using the same logic as Matching engine
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

                const skillWords = new Set([
                  "react", "javascript", "typescript", "node", "java", "python", "sql", "html", "css", "rust",
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
                    "career", "specialization", "profile", "learning", "great",
                    // University/Institution keywords
                    "vidyapeetham", "institute", "institution", "academy", "school", "polytechnic", "engineering",
                    "management", "studies", "campus", "department", "faculty", "amrita", "iit", "nit", "iim",
                    // Common skill patterns
                    "strong", "proficient", "experienced", "familiar", "knowledge", "expertise"
                  ];

                  // Check for university/institution patterns
                  const universityPatterns = [
                    /\b(university|college|institute|institution|academy|school|vidyapeetham|polytechnic)\b/i,
                    /\b(engineering|management|studies|campus|department|faculty)\b/i,
                    /\b(amrita|iit|nit|iim|bits|vit|srm|manipal)\b/i
                  ];

                  // Check for skill-like patterns (e.g., "Rust. Strong", "Java. Expert")
                  const skillPattern = /^[A-Z][a-z]+\.\s*[A-Z][a-z]+$/;

                  // Check if it looks like a skill list or tech stack
                  const words = lower.split(/\s+/).filter(w => w.length > 0);
                  const skillWordCount = words.filter(w => skillWords.has(w.trim())).length;
                  const isLikelySkillList = skillWordCount >= 2 || (skillWordCount >= 1 && words.length <= 3);

                  return badKeywords.some((kw) => lower.includes(kw)) ||
                    /^https?:\/\//.test(s) ||
                    /^\d+[\s\d-]*$/.test(s) ||
                    /@/.test(s) ||
                    /[.,;:!?\-]{2,}/.test(s) ||
                    /\b(section|heading|title|header|project|feature|technolog)\b/i.test(lower) ||
                    looksLikeSkillList(s) ||
                    containsTechTerms(s) ||
                    s.split(/[\s,]+/).some((w) => skillWords.has(w.toLowerCase().trim()))
                    || universityPatterns.some(pattern => pattern.test(s))
                    || skillPattern.test(s)
                    || isLikelySkillList;
                };

                const allLines = text.split(/\r?\n/).map(cleanLine).filter(l => l.length > 0);
                const lines = allLines.slice(0, 20);

                const labelPatterns = [
                  /(?:^|\n)\s*(?:name|full\s+name|fullname|applicant\s+name|candidate\s+name)[:\-\s]+([A-Za-z][A-Za-z\s.'-]{2,100})/i,
                  /(?:^|\n)\s*(?:name|full\s+name)[:\-\s]+([A-Za-z][A-Za-z\s.'-]{2,100})/i,
                ];
                for (const pattern of labelPatterns) {
                  const match = text.match(pattern)?.[1]?.trim();
                  if (match) {
                    const cleaned = cleanLine(match);
                    if (cleaned.length >= 3 && cleaned.length <= 100 && !isBad(cleaned) && !/@/.test(cleaned)) {
                      return formatName(cleaned);
                    }
                  }
                }

                if (lines.length > 0) {
                  const firstLine = lines[0];
                  if (looksLikeSkillList(firstLine) || containsTechTerms(firstLine) || firstLine.split(/[\s,]+/).some((w) => skillWords.has(w.toLowerCase().trim()))) {
                  } else if (!isBad(firstLine) && firstLine.length >= 3 && firstLine.length <= 60) {
                    const words = firstLine.split(/\s+/).filter(w => w.length > 0);
                    if (words.length >= 2 && words.length <= 4) {
                      const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
                      if (allAlpha) {
                        const hasSkillWord = words.some((w) => skillWords.has(w.toLowerCase().trim()));
                        const hasTechTerm = containsTechTerms(firstLine);
                        if (!hasSkillWord && !hasTechTerm) {
                          const capitalCount = words.filter(w => /^[A-Z]/.test(w)).length;
                          const allCapsCount = words.filter(w => w === w.toUpperCase() && w.length > 1).length;
                          const capitalRatio = capitalCount / words.length;
                          const isAllCaps = allCapsCount === words.length && words.length >= 2;
                          if ((capitalRatio >= 0.7 || isAllCaps) && !/\d{2,}/.test(firstLine) && !isBad(firstLine)) {
                            return formatName(firstLine);
                          }
                        }
                      }
                    }
                  }
                }

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
                    return formatName(line);
                  }
                }

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
                      return formatName(line);
                    }
                  }
                }

                for (let i = 0; i < Math.min(8, lines.length); i++) {
                  const line = lines[i];
                  if (isBad(line) || line.length < 3 || line.length > 80) continue;
                  const words = line.split(/\s+/).filter(w => w.length > 0);
                  if (words.length >= 2 && words.length <= 5) {
                    const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
                    if (!allAlpha) continue;
                    const allUpper = words.every(w => w === w.toUpperCase() && w.length > 1);
                    const titleCase = words.every(w => /^[A-Z][a-z]+$/.test(w));
                    const mostlyCap = words.filter(w => /^[A-Z]/.test(w)).length >= words.length * 0.6;
                    if ((allUpper || titleCase || mostlyCap) && !/\d/.test(line) && !/@/.test(line)) {
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
                    return formatName(collected.join(' '));
                  }
                }

                const firstBlock = lines.slice(0, 5).join(' ');
                const multiWordRx = /\b([A-Z][A-Za-z'.-]{1,})(?:\s+[A-Z][A-Za-z'.-]{1,}){1,3}\b/g;
                for (const match of firstBlock.matchAll(multiWordRx)) {
                  const candidate = match[0].trim();
                  if (isBad(candidate) || candidate.length > 60) continue;
                  const words = candidate.split(/\s+/).filter(w => w.length > 0);
                  if (words.length < 2 || words.length > 4) continue;
                  if (words.some(w => w.length < 2)) continue;
                  if (words.some(w => /[.,;:!?\-]{2,}/.test(w))) continue;
                  if (isBad(candidate)) continue;
                  return formatName(candidate);
                }

                if (email) {
                  const emailIndex = lines.findIndex(l => l.includes(email));
                  if (emailIndex > 0) {
                    const beforeEmail = lines[emailIndex - 1];
                    if (beforeEmail && !isBad(beforeEmail) && beforeEmail.length >= 3 && beforeEmail.length <= 80) {
                      const words = beforeEmail.split(/\s+/).filter(w => w.length > 0);
                      if (words.length >= 2 && words.length <= 5) {
                        const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
                        if (allAlpha && !/@/.test(beforeEmail) && !/\d{2,}/.test(beforeEmail)) {
                          return formatName(beforeEmail);
                        }
                      }
                    }
                  }
                }

                if (email) {
                  const prefix = email.split('@')[0];
                  const parts = prefix.split(/[._-]+/).filter(p => p.length >= 2 && /^[a-z]+$/i.test(p));
                  if (parts.length >= 2 && parts.length <= 3) {
                    const raw = parts.join(' ');
                    return formatName(raw);
                  }
                }

                const fallback = fileName
                  .replace(/\.(pdf|docx)$/i, '')
                  .replace(/^\d+_\d+_\d*_?/, '')
                  .replace(/[_-]+/g, ' ')
                  .replace(/\b(resume|cv|curriculum|vitae|_)\b/ig, '')
                  .trim();

                if (fallback && fallback.length >= 2) {
                  return formatName(fallback);
                }

                return fileName;
              };

              extractedName = extractCandidateName(text, extractedEmail, file.name);
            }
          } catch (extractError) {
            console.warn(`Could not extract data from ${file.name}:`, extractError);
          }

          // Ensure we always have an email (DB constraint)
          const fallbackEmail = extractedEmail || `noemail+${resumeHash.slice(0, 16)}@resume.local`;
          const candidateEmail = fallbackEmail.toLowerCase();

          // Create candidate record
          const { error: insertError } = await supabase
            .from("candidates")
            .insert({
              full_name: extractedName,
              email: candidateEmail,
              phone: extractedPhone,
              status: "Pending",
              resume_url: resumeUrl,
              resume_hash: resumeHash,
              resume_processed: false,
              job_id: null,
            });

          if (insertError) {
            // If duplicate email, try to update
            if (insertError.code === "23505" && insertError.message.includes("email")) {
              await supabase
                .from("candidates")
                .update({
                  full_name: extractedName,
                  phone: extractedPhone,
                  resume_url: resumeUrl,
                  resume_hash: resumeHash,
                  resume_processed: false,
                })
                .eq("email", candidateEmail);
              results.success++;
            } else {
              results.failed++;
              results.errors.push(`${file.name}: ${insertError.message}`);
            }
          } else {
            results.success++;
          }
        } catch (error: any) {
          results.failed++;
          results.errors.push(`${file.name}: ${error.message || 'Unknown error'}`);
        }
      }

      // Show results
      const message = `Uploaded ${results.success} resume(s) successfully.${results.skipped > 0 ? ` ${results.skipped} skipped (duplicates).` : ""}${results.failed > 0 ? ` ${results.failed} could not be processed.` : ""}`;
      toast({
        title: "Upload Complete",
        description: message,
        variant: "default",
      });

      // Reset form
      setSelectedResumeFiles([]);
      setUploadResumesDialogOpen(false);

      // Refresh the candidates list
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });
      await queryClient.refetchQueries({ queryKey: ["all-candidates-with-storage"] });
    } catch (error: any) {
      console.error("Error uploading resumes:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload resumes.",
        variant: "destructive",
      });
    } finally {
      setUploadingResumes(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingCandidate) return;

    // Validate required fields
    if (!editForm.name.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a candidate name.",
        variant: "destructive",
      });
      return;
    }

    if (!editForm.email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter an email address.",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    const emailTrimmed = editForm.email.trim();
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    if (!emailRegex.test(emailTrimmed)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Check if this is a storage-only candidate (not in database yet)
      if (editingCandidate.id.startsWith('storage-')) {
        // Use resumeUrl from candidate if available, otherwise extract from ID
        let resumeUrl = editingCandidate.resumeUrl;

        if (!resumeUrl) {
          // Extract resume_url from the storage ID
          // Format: storage-{bucket}-{filename}
          // Example: storage-resumes-private-1762099947537_0_filename.pdf
          const withoutPrefix = editingCandidate.id.replace('storage-', '');
          // Find the first occurrence of a known bucket name
          const knownBuckets = STORAGE_BUCKETS;
          let bucket = 'resumes-private'; // default
          let filename = withoutPrefix;

          for (const knownBucket of knownBuckets) {
            if (withoutPrefix.startsWith(knownBucket + '-')) {
              bucket = knownBucket;
              filename = withoutPrefix.substring(knownBucket.length + 1); // +1 for the hyphen
              break;
            }
          }

          resumeUrl = `${bucket}/${filename}`;
        }

        // Create a new candidate entry in the database
        const { data: newCandidate, error: insertError } = await supabase
          .from('candidates')
          .insert({
            full_name: editForm.name.trim(),
            email: emailTrimmed.toLowerCase(),
            phone: editForm.phone.trim() || null,
            resume_url: resumeUrl,
            status: 'Pending',
            resume_processed: false,
            reference_source: editForm.referenceSource || null,
          })
          .select('id')
          .single();

        if (insertError) {
          // If it's a duplicate email error, try to update instead
          if (insertError.code === '23505' || insertError.message.includes('duplicate')) {
            const { data: existing, error: findError } = await supabase
              .from('candidates')
              .select('id')
              .eq('email', emailTrimmed.toLowerCase())
              .maybeSingle();

            if (!findError && existing) {
              // Update existing candidate
              const { error: updateError } = await supabase
                .from('candidates')
                .update({
                  full_name: editForm.name.trim(),
                  phone: editForm.phone.trim() || null,
                  resume_url: resumeUrl,
                  reference_source: editForm.referenceSource || null,
                })
                .eq('id', existing.id);

              if (updateError) throw updateError;
            } else {
              throw insertError;
            }
          } else {
            throw insertError;
          }
        }

        toast({
          title: "Success",
          description: "Candidate information saved successfully.",
          variant: "default",
        });
      } else {
        // Update existing candidate
        const updates: {
          full_name?: string;
          email?: string;
          phone?: string;
        } = {};

        updates.full_name = editForm.name.trim();
        updates.email = emailTrimmed.toLowerCase();
        if (editForm.phone.trim()) {
          updates.phone = editForm.phone.trim();
        } else {
          updates.phone = null;
        }

        const { error: updateError } = await supabase
          .from('candidates')
          .update(updates)
          .eq('id', editingCandidate.id);

        if (updateError) throw updateError;

        toast({
          title: "Success",
          description: "Candidate information updated successfully.",
          variant: "default",
        });
      }

      // Invalidate and refetch
      await queryClient.invalidateQueries({ queryKey: ['all-candidates-with-storage'] });

      setEditDialogOpen(false);
      setEditingCandidate(null);
    } catch (error: any) {
      console.error("Error saving candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save candidate information.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back! Here's your recruitment overview.</p>
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:justify-end">
          <Button
            onClick={() => setAddCandidateDialogOpen(true)}
            className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md w-full sm:w-auto"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add New Candidate
          </Button>
          <Button
            onClick={() => setUploadResumesDialogOpen(true)}
            className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md w-full sm:w-auto"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Resumes
          </Button>
          <Button
            onClick={() => navigate("/recruitment-hub")}
            className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Job
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Candidates
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={async () => {
                  // Refresh all dashboard data
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] }),
                    queryClient.invalidateQueries({ queryKey: ["jobs-count"] }),
                    queryClient.invalidateQueries({ queryKey: ["shortlisted-count"] }),
                    queryClient.invalidateQueries({ queryKey: ["interview-scheduled-count"] }),
                    queryClient.invalidateQueries({ queryKey: ["feedback-count"] }),
                    queryClient.invalidateQueries({ queryKey: ["document-verification-count"] }),
                    queryClient.invalidateQueries({ queryKey: ["approved-count"] }),
                    queryClient.invalidateQueries({ queryKey: ["experience-letter-count"] }),
                    queryClient.invalidateQueries({ queryKey: ["job-basic-info"] }),
                  ]);
                  await Promise.all([
                    refetchCandidates(),
                    queryClient.refetchQueries({ queryKey: ["jobs-count"] }),
                    queryClient.refetchQueries({ queryKey: ["shortlisted-count"] }),
                    queryClient.refetchQueries({ queryKey: ["interview-scheduled-count"] }),
                    queryClient.refetchQueries({ queryKey: ["feedback-count"] }),
                    queryClient.refetchQueries({ queryKey: ["document-verification-count"] }),
                    queryClient.refetchQueries({ queryKey: ["approved-count"] }),
                    queryClient.refetchQueries({ queryKey: ["experience-letter-count"] }),
                    queryClient.refetchQueries({ queryKey: ["job-basic-info"] }),
                  ]);
                  toast({
                    title: "Refreshed",
                    description: "Dashboard data has been refreshed.",
                  });
                }}
                title="Refresh count"
              >
                <RefreshCw className="h-4 w-4 text-primary" />
              </Button>
              <Users className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{totalDashboardCandidates}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total candidates in dashboard
            </p>
          </CardContent>
        </Card>

        <Card
          className="shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none"
          onClick={() => navigate("/recruitment-hub")}
          onKeyDown={handleJobsCardKeyDown}
          role="button"
          tabIndex={0}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Jobs
            </CardTitle>
            <Briefcase className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{jobsCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total positions
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Button
          onClick={() => navigate("/shortlist")}
          className="h-auto p-6 flex flex-col items-start justify-start gap-2 shadow-md hover:shadow-lg transition-shadow duration-200"
          variant="outline"
        >
          <div className="flex items-center justify-between w-full">
            <CheckSquare className="h-6 w-6 text-primary" />
            <span className="text-2xl font-bold">{shortlistedCount || 0}</span>
          </div>
          <div className="text-left">
            <p className="font-semibold text-base">Shortlist</p>
            <p className="text-xs text-muted-foreground">View shortlisted candidates</p>
          </div>
        </Button>

        <Button
          onClick={() => navigate("/interview")}
          className="h-auto p-6 flex flex-col items-start justify-start gap-2 shadow-md hover:shadow-lg transition-shadow duration-200"
          variant="outline"
        >
          <div className="flex items-center justify-between w-full">
            <Calendar className="h-6 w-6 text-primary" />
            <span className="text-2xl font-bold">{interviewScheduledCount || 0}</span>
          </div>
          <div className="text-left">
            <p className="font-semibold text-base">Interview</p>
            <p className="text-xs text-muted-foreground">Schedule interviews</p>
          </div>
        </Button>

        <Button
          onClick={() => navigate("/feedback")}
          className="h-auto p-6 flex flex-col items-start justify-start gap-2 shadow-md hover:shadow-lg transition-shadow duration-200"
          variant="outline"
        >
          <div className="flex items-center justify-between w-full">
            <MessageSquare className="h-6 w-6 text-primary" />
            <span className="text-2xl font-bold">{feedbackCount || 0}</span>
          </div>
          <div className="text-left">
            <p className="font-semibold text-base">Feedback</p>
            <p className="text-xs text-muted-foreground">Submit interview feedback</p>
          </div>
        </Button>

        <Button
          onClick={() => navigate("/document-verification")}
          className="h-auto p-6 flex flex-col items-start justify-start gap-2 shadow-md hover:shadow-lg transition-shadow duration-200"
          variant="outline"
        >
          <div className="flex items-center justify-between w-full">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="text-2xl font-bold">{documentVerificationCount || 0}</span>
          </div>
          <div className="text-left">
            <p className="font-semibold text-base">CID Verification</p>
            <p className="text-xs text-muted-foreground">Verify candidate documents</p>
          </div>
        </Button>

        <Button
          onClick={() => navigate("/offer-letter")}
          className="h-auto p-6 flex flex-col items-start justify-start gap-2 shadow-md hover:shadow-lg transition-shadow duration-200"
          variant="outline"
        >
          <div className="flex items-center justify-between w-full">
            <FileText className="h-6 w-6 text-primary" />
            <span className="text-2xl font-bold">{approvedCount || 0}</span>
          </div>
          <div className="text-left">
            <p className="font-semibold text-base">Offer Letter</p>
            <p className="text-xs text-muted-foreground">Generate offer letters</p>
          </div>
        </Button>

        <Button
          onClick={() => navigate("/experience-letter")}
          className="h-auto p-6 flex flex-col items-start justify-start gap-2 shadow-md hover:shadow-lg transition-shadow duration-200"
          variant="outline"
        >
          <div className="flex items-center justify-between w-full">
            <Award className="h-6 w-6 text-primary" />
            <span className="text-2xl font-bold">{experienceLetterCount || 0}</span>
          </div>
          <div className="text-left">
            <p className="font-semibold text-base">Experience Letter</p>
            <p className="text-xs text-muted-foreground">Upload experience letters</p>
          </div>
        </Button>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">All Candidate Uploads</CardTitle>
          <p className="text-sm text-muted-foreground">All resume submissions (real data)</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2 lg:col-span-2">
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Search Candidate
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by name, email, or phone"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Date Range
              </p>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Stage
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                  >
                    {stageFilter.length === 0
                      ? "All stages"
                      : stageFilter.length === 1
                        ? stageFilter[0]
                        : `${stageFilter.length} stages selected`}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <div className="p-2 space-y-1">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between rounded-sm px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => setStageFilter([])}
                    >
                      <span>All stages</span>
                      {stageFilter.length === 0 && (
                        <span className="text-xs font-medium text-primary">Active</span>
                      )}
                    </button>
                    <div className="h-px bg-border my-1" />
                    {[
                      "Applied",
                      "Shortlisted",
                      "Rejected",
                      "Interview Scheduled",
                      "Approved",
                    ].map((stage) => (
                      <div
                        key={stage}
                        className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm"
                      >
                        <Checkbox
                          checked={stageFilter.includes(stage)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setStageFilter((prev) => [...prev, stage]);
                            } else {
                              setStageFilter((prev) =>
                                prev.filter((s) => s !== stage)
                              );
                            }
                          }}
                          id={`stage-${stage}`}
                        />
                        <label
                          htmlFor={`stage-${stage}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          {stage}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Role Applied
              </p>
              <Select value={jobFilter} onValueChange={setJobFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="no-job">No role assigned</SelectItem>
                  {jobOptions.map((job) => (
                    <SelectItem key={job} value={job}>
                      {job}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job Applied</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Phone</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No candidates match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCandidates.map((candidate) => (
                    <TableRow
                      key={candidate.id}
                      className="hover:bg-accent/50 transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
                            {getInitials(candidate.name)}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-foreground">{candidate.name}</p>
                            {candidate.createdLabel && (
                              <p className="text-xs text-muted-foreground">
                                Added {candidate.createdLabel}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-foreground">
                        {candidate.jobApplied}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={candidate.status || "Pending"}
                          onValueChange={(value) => handleStatusUpdate(candidate, value)}
                        >
                          <SelectTrigger className="w-[150px] h-8 text-xs font-medium">
                            <SelectValue>
                              <Badge className={`capitalize ${getStatusBadgeClass(candidate.status || "Pending")}`}>
                                {formatStatus(candidate.status || "Pending")}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Shortlisted">Shortlisted</SelectItem>
                            <SelectItem value="Rejected">Rejected</SelectItem>
                            <SelectItem value="Interview Scheduled">Interview Scheduled</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {candidate.email}
                      </TableCell>
                      <TableCell className="text-right text-sm text-foreground">
                        {candidate.phone}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {candidate.resumeUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewResume(candidate.resumeUrl)}
                              className="h-8 w-8 p-0"
                              title="View Resume"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              className="h-8 w-8 p-0 opacity-50 cursor-not-allowed"
                              title="No Resume Available - Click Edit to upload"
                            >
                              <FileX className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(candidate)}
                            className="h-8 w-8 p-0"
                            title="Edit Candidate"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteClick(candidate);
                            }}
                            disabled={deleting}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive disabled:opacity-50"
                            title="Delete Candidate"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Candidate Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setLastResumeRequestSent(null);
        }
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Candidate Information</DialogTitle>
            <DialogDescription>
              Update candidate details. You can view the resume to verify the correct information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="resume-view" className="text-sm font-medium">
                Resume
              </Label>
              <div className="flex gap-2">
                {editingCandidate?.resumeUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => editingCandidate && handleViewResume(editingCandidate.resumeUrl)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Resume
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 p-3 border border-dashed border-muted-foreground/30 rounded-md bg-muted/30">
                        <FileX className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="resume-upload-edit" className="text-sm text-muted-foreground">
                          No resume uploaded - Upload resume below
                        </Label>
                      </div>
                      {editingCandidate && (editingCandidate.email || editForm.email) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {lastResumeRequestSent ? (
                            <div className="flex items-center gap-2 p-2 border border-muted-foreground/30 rounded-md bg-muted/30">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                Already sent on {lastResumeRequestSent.date} at {lastResumeRequestSent.time}
                              </span>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="self-start"
                              disabled={requestResumeEmailMutation.isPending || !editForm.referenceSource}
                              onClick={() => requestResumeEmailMutation.mutate()}
                              title={!editForm.referenceSource ? "Please select a Reference Source first" : ""}
                            >
                              {requestResumeEmailMutation.isPending ? (
                                <>
                                  <Mail className="h-4 w-4 mr-2 animate-pulse" />
                                  Sending request...
                                </>
                              ) : (
                                <>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Request Resume Mail
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="self-start"
                            onClick={handleViewResumeRequestHistory}
                          >
                            <History className="h-4 w-4 mr-2" />
                            History
                          </Button>
                        </div>
                      )}
                    </div>
                    <input
                      id="resume-upload-edit"
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !editingCandidate) return;

                        if (!/\.pdf$/i.test(file.name)) {
                          toast({
                            title: "Invalid File",
                            description: "Please upload a PDF file.",
                            variant: "destructive",
                          });
                          return;
                        }

                        setUploadingResume(true);
                        try {
                          const resumeHash = await computeFileHash(file);
                          const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET || "resumes-private";
                          const candidateBuckets = Array.from(new Set([envBucket, "resumes-private", "resumes"]));

                          const timestamp = Date.now();
                          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
                          const storageFileName = `${timestamp}_0_${sanitizedFileName}`;

                          let uploaded = false;
                          let resumeUrl: string | null = null;

                          for (const BUCKET_NAME of candidateBuckets) {
                            const { error: uploadError } = await supabase.storage
                              .from(BUCKET_NAME)
                              .upload(storageFileName, file, {
                                cacheControl: "3600",
                                upsert: false,
                                metadata: { file_hash: resumeHash, original_name: file.name },
                              });

                            if (!uploadError) {
                              uploaded = true;
                              resumeUrl = `${BUCKET_NAME}/${storageFileName}`;
                              break;
                            }
                          }

                          if (!uploaded) {
                            throw new Error("Failed to upload resume");
                          }

                          // Update candidate with resume URL
                          if (editingCandidate.id.startsWith('storage-')) {
                            // Create new candidate entry
                            await supabase.from("candidates").insert({
                              full_name: editForm.name.trim(),
                              email: editForm.email.trim(),
                              phone: editForm.phone.trim() || null,
                              status: "Pending",
                              resume_url: resumeUrl,
                              resume_hash: resumeHash,
                            });
                          } else {
                            // Update existing candidate
                            await supabase
                              .from("candidates")
                              .update({
                                resume_url: resumeUrl,
                                resume_hash: resumeHash,
                              })
                              .eq("id", editingCandidate.id);
                          }

                          toast({
                            title: "Resume Uploaded",
                            description: "Resume has been uploaded successfully.",
                          });

                          // Refresh candidates list
                          await queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });
                          setEditDialogOpen(false);
                        } catch (error: any) {
                          toast({
                            title: "Upload Failed",
                            description: error.message || "Failed to upload resume.",
                            variant: "destructive",
                          });
                        } finally {
                          setUploadingResume(false);
                          e.target.value = ""; // Reset file input
                        }
                      }}
                    />
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => document.getElementById("resume-upload-edit")?.click()}
                      disabled={uploadingResume}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploadingResume ? "Uploading..." : "Upload Resume"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Enter candidate name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="Enter email address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-reference-source">Reference Source</Label>
              <Select
                value={editForm.referenceSource}
                onValueChange={(value) => setEditForm({ ...editForm, referenceSource: value })}
              >
                <SelectTrigger id="edit-reference-source">
                  <SelectValue placeholder="Select reference source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="internshala">Internshala</SelectItem>
                  <SelectItem value="naukri">Naukri</SelectItem>
                  <SelectItem value="friend_referral">Friend / Referral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setEditingCandidate(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resume Request Email History Dialog */}
      <Dialog open={resumeRequestHistoryOpen} onOpenChange={setResumeRequestHistoryOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Resume Request Email History</DialogTitle>
            <DialogDescription>
              View all resume request emails sent to this candidate.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {resumeRequestHistoryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : resumeRequestHistoryEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No resume request emails sent yet.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {resumeRequestHistoryEntries.map((entry, index) => {
                  const sentDate = new Date(entry.created_at);
                  return (
                    <div
                      key={entry.id || index}
                      className="p-3 border border-border rounded-md bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{entry.details}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {sentDate.toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResumeRequestHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Candidate Dialog */}
      <Dialog open={addCandidateDialogOpen} onOpenChange={setAddCandidateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Candidate</DialogTitle>
            <DialogDescription>
              Add a new candidate to the system. You can optionally upload their resume.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Full Name *</Label>
              <Input
                id="new-name"
                value={newCandidateForm.name}
                onChange={(e) => setNewCandidateForm({ ...newCandidateForm, name: e.target.value })}
                placeholder="Enter candidate name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email *</Label>
              <Input
                id="new-email"
                type="email"
                value={newCandidateForm.email}
                onChange={(e) => setNewCandidateForm({ ...newCandidateForm, email: e.target.value })}
                placeholder="Enter email address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-phone">Phone</Label>
              <Input
                id="new-phone"
                value={newCandidateForm.phone}
                onChange={(e) => setNewCandidateForm({ ...newCandidateForm, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resume-upload">Resume (PDF)</Label>
              <div className="flex items-center gap-2">
                <input
                  id="resume-upload"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setNewCandidateForm({ ...newCandidateForm, resumeFile: file });
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById("resume-upload")?.click()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {newCandidateForm.resumeFile ? newCandidateForm.resumeFile.name : "Choose Resume File"}
                </Button>
                {newCandidateForm.resumeFile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewCandidateForm({ ...newCandidateForm, resumeFile: null })}
                  >
                    Remove
                  </Button>
                )}
              </div>
              {newCandidateForm.resumeFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {newCandidateForm.resumeFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddCandidateDialogOpen(false);
                setNewCandidateForm({
                  name: "",
                  email: "",
                  phone: "",
                  resumeFile: null,
                });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddCandidate} disabled={uploadingResume}>
              {uploadingResume ? "Adding..." : "Add Candidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Resumes Dialog */}
      <Dialog open={uploadResumesDialogOpen} onOpenChange={setUploadResumesDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Upload Resumes</DialogTitle>
            <DialogDescription>
              Upload multiple PDF resumes. Names, emails, and phone numbers will be automatically extracted from each resume.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-resume-upload">Select PDF Files</Label>
              <div className="flex items-center gap-2">
                <input
                  id="bulk-resume-upload"
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setSelectedResumeFiles(files);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById("bulk-resume-upload")?.click()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {selectedResumeFiles.length > 0
                    ? `${selectedResumeFiles.length} file(s) selected`
                    : "Choose Resume Files"}
                </Button>
                {selectedResumeFiles.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedResumeFiles([])}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {selectedResumeFiles.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  <p className="text-sm font-medium mb-2">Selected Files ({selectedResumeFiles.length}):</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {selectedResumeFiles.map((file, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        <span className="truncate">{file.name}</span>
                        <span className="text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {uploadingResumes && uploadProgress.total > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading resumes...</span>
                  <span>{uploadProgress.current} / {uploadProgress.total}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadResumesDialogOpen(false);
                setSelectedResumeFiles([]);
              }}
              disabled={uploadingResumes}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkUploadResumes}
              disabled={uploadingResumes || selectedResumeFiles.length === 0}
            >
              {uploadingResumes
                ? `Uploading... (${uploadProgress.current}/${uploadProgress.total})`
                : `Upload ${selectedResumeFiles.length} Resume(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Save, Edit, Trash2, TrendingUp, GraduationCap, Briefcase, Eye, Download, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

// Skill dictionary for extraction
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
    const pattern = new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
    if (pattern.test(lower)) set.add(key);
  }
  return Array.from(set);
};

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
    "react", "javascript", "typescript", "node", "java", "python", "sql", "html", "css",
    "angular", "vue", "express", "mongodb", "mysql", "postgres", "aws", "azure", "gcp",
    "docker", "kubernetes", "git", "github", "gitlab", "api", "rest", "graphql", "json",
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
    return false;
  };

  const isBad = (s: string) => {
    const lower = s.toLowerCase();
    const badKeywords = [
      "resume", "curriculum", "vitae", "cv", "email", "phone", "address", "objective", "summary",
      "experience", "education", "skills", "projects", "linkedin", "github", "portfolio",
    ];
    return badKeywords.some((kw) => lower.includes(kw)) ||
           /^https?:\/\//.test(s) ||
           /^\d+[\s\d-]*$/.test(s) ||
           /@/.test(s) ||
           looksLikeSkillList(s) ||
           containsTechTerms(s);
  };

  const allLines = text.split(/\r?\n/).map(cleanLine).filter(l => l.length > 0);
  const lines = allLines.slice(0, 20);

  if (lines.length > 0) {
    const firstLine = lines[0];
    if (!looksLikeSkillList(firstLine) && !containsTechTerms(firstLine) && !isBad(firstLine) && firstLine.length >= 3 && firstLine.length <= 60) {
      const words = firstLine.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2 && words.length <= 4) {
        const allAlpha = words.every(w => /^[A-Za-z'.-]+$/.test(w));
        if (allAlpha) {
          const hasSkillWord = words.some((w) => skillWords.has(w.toLowerCase().trim()));
          const hasTechTerm = containsTechTerms(firstLine);
          if (!hasSkillWord && !hasTechTerm) {
            const capitalCount = words.filter(w => /^[A-Z]/.test(w)).length;
            const capitalRatio = capitalCount / words.length;
            if (capitalRatio >= 0.7 && !/\d{2,}/.test(firstLine) && !isBad(firstLine)) {
              return formatName(firstLine);
            }
          }
        }
      }
    }
  }

  if (email) {
    const prefix = email.split('@')[0];
    const parts = prefix.split(/[._-]+/).filter(p => p.length >= 2 && /^[a-z]+$/i.test(p));
    if (parts.length >= 2 && parts.length <= 3) {
      return formatName(parts.join(' '));
    }
  }

  const fallback = fileName
    .replace(/\.(pdf|docx)$/i, '')
    .replace(/^\d+_\d+_\d*_?/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(resume|cv|curriculum|vitae|_)\b/ig, '')
    .trim();
  
  return fallback && fallback.length >= 2 ? formatName(fallback) : fileName;
};

export default function RecruitmentHub() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Job Management State
  const [showForm, setShowForm] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    job_title: "",
    department: "",
    description: "",
    required_skills: "",
  });
  const [deletingJobId, setDeletingJobId] = useState<string | number | null>(null);
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());

  // Matching State
  const [selectedJob, setSelectedJob] = useState("");
  const [localPending, setLocalPending] = useState(false);
  const [localResults, setLocalResults] = useState<LocalResult[]>([]);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [editDialogOpenMatch, setEditDialogOpenMatch] = useState(false);
  const [editingResultIndex, setEditingResultIndex] = useState<number | null>(null);
  const [editFormMatch, setEditFormMatch] = useState({
    name: "",
    email: "",
    phone: "",
    skills: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [candidateStatuses, setCandidateStatuses] = useState<Record<string, string>>({});
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(HIDDEN_JOBS_STORAGE_KEY) : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHiddenJobIds(new Set(parsed.map(String)));
        }
      }
    } catch (err) {
      console.warn("Failed to load hidden jobs", err);
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(HIDDEN_JOBS_STORAGE_KEY, JSON.stringify(Array.from(hiddenJobIds)));
      }
    } catch (err) {
      console.warn("Failed to persist hidden jobs", err);
    }
  }, [hiddenJobIds]);

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

  const visibleJobs = useMemo(() => {
    if (hiddenJobIds.size === 0) return jobs;
    return jobs.filter((job) => !hiddenJobIds.has(String(job.id)));
  }, [jobs, hiddenJobIds]);

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

  // Job Management Functions
  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    try {
      const skillsString = formData.get('skills') as string;
      const skillsArray = skillsString.split(',').map(s => s.trim());
      
      const { error } = await supabase
        .from('jobs')
        .insert({
          job_title: formData.get('job-title') as string,
          department: formData.get('department') as string,
          description: formData.get('description') as string,
          required_skills: skillsArray,
          experience_required: null,
        });

      if (error) throw error;

      toast({
        title: "Job saved successfully!",
        description: "The job posting has been added to the database",
      });
      
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
      await queryClient.invalidateQueries({ queryKey: ['jobs-count'] });
      setShowForm(false);
    } catch (error: any) {
      toast({
        title: "Error saving job",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (job: any) => {
    setEditingJob(job);
    setEditForm({
      job_title: job.job_title ?? "",
      department: job.department ?? "",
      description: job.description ?? "",
      required_skills: Array.isArray(job.required_skills) ? job.required_skills.join(", ") : job.required_skills ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleUpdateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob) return;

    try {
      const skillsArray = editForm.required_skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from("jobs")
        .update({
          job_title: editForm.job_title,
          department: editForm.department,
          description: editForm.description,
          required_skills: skillsArray,
          experience_required: null,
        })
        .eq("id", editingJob.id);

      if (error) throw error;

      toast({
        title: "Job updated",
        description: `${editForm.job_title} has been updated successfully.`,
      });

      setEditDialogOpen(false);
      setEditingJob(null);
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs-count"] });
    } catch (error: any) {
      toast({
        title: "Error updating job",
        description: error.message || "Could not update the job details.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteJob = async (job: any) => {
    setDeletingJobId(job.id);
    try {
      const idToDelete = job.id;

      queryClient.setQueryData(["jobs"], (oldData: any[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.filter((existingJob) => existingJob.id !== idToDelete);
      });

      queryClient.setQueryData(["jobs-count"], (oldCount: number | undefined) => {
        return (oldCount ?? 0) > 0 ? oldCount - 1 : 0;
      });

      const { error: matchesError } = await supabase
        .from("matches")
        .delete()
        .eq("job_id", idToDelete);

      if (matchesError) throw matchesError;

      const { error } = await supabase
        .from("jobs")
        .delete()
        .eq("id", idToDelete);

      if (error) throw error;

      setHiddenJobIds((prev) => {
        if (prev.has(String(idToDelete))) return prev;
        const next = new Set(prev);
        next.add(String(idToDelete));
        return next;
      });

      toast({
        title: "Job deleted",
        description: `${job.job_title ?? "Job"} has been removed.`,
      });

      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs-count"] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
    } catch (error: any) {
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs-count"] });
      toast({
        title: "Error deleting job",
        description: error.message || "Could not delete job.",
        variant: "destructive",
      });
    } finally {
      setDeletingJobId(null);
    }
  };

  // Matching Functions
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
            const allSkills = Array.from(new Set(SKILL_DICT.filter(k => lower.includes(k))));
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

  const openEditDialogMatch = (result: LocalResult, index: number) => {
    setEditingResultIndex(index);
    setEditFormMatch({
      name: result.name || "",
      email: result.email || "",
      phone: result.phone || "",
      skills: result.skills.join(", "),
    });
    setEditDialogOpenMatch(true);
  };

  const resetEditDialogMatch = () => {
    setEditDialogOpenMatch(false);
    setEditingResultIndex(null);
    setEditFormMatch({
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

    const nameInput = editFormMatch.name.trim();
    const emailInput = editFormMatch.email.trim();
    const emailLookup = emailInput.toLowerCase();
    const phoneInput = editFormMatch.phone.trim();
    const parsedSkills = editFormMatch.skills
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

      resetEditDialogMatch();
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

  const handleViewPDF = async (source: string) => {
    try {
      const [bucket, ...fileParts] = source.split('/');
      const fileName = fileParts.join('/');
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(fileName, 3600);
      
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

  const handleShortlist = async (result: LocalResult) => {
    const processingKey = `${result.source}-shortlist`;
    setProcessingStatus(processingKey);
    
    try {
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

      const { error: logError } = await supabase.from('activity_logs').insert({
        action: 'STATUS_UPDATED',
        details: `${result.name} has been shortlisted`,
      });

      if (logError) console.warn('Failed to log activity:', logError);

      toast({
        title: "Candidate Shortlisted",
        description: `${result.name} has been added to the shortlist`,
      });

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

  // Fetch candidate statuses for existing candidates
  useEffect(() => {
    const fetchStatuses = async () => {
      const candidateIds = localResults
        .map(r => r.candidateId)
        .filter((id): id is string => id !== null);
      
      if (candidateIds.length === 0) return;

      try {
        const { data, error } = await supabase
          .from('candidates')
          .select('id, status')
          .in('id', candidateIds);

        if (error) throw error;

        const statusMap: Record<string, string> = {};
        (data || []).forEach((c: any) => {
          statusMap[c.id] = c.status || 'Pending';
        });

        setCandidateStatuses(statusMap);
      } catch (err) {
        console.warn('Failed to fetch candidate statuses:', err);
      }
    };

    if (localResults.length > 0) {
      fetchStatuses();
    }
  }, [localResults]);

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

  const handleStatusUpdate = async (result: LocalResult, newStatus: string) => {
    const statusKey = result.candidateId || result.source;
    setUpdatingStatusId(statusKey);
    
    try {
      let candidateId: string | null = result.candidateId ?? null;
      
      // Check for existing candidate by email if not found by ID
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

      // If candidate doesn't exist, create it
      if (!candidateId) {
        const normalizedSource = normalizeResumePath(result.source) || result.source;
        
        const { data: newCandidate, error: createError } = await supabase
          .from('candidates')
          .insert({
            full_name: result.name,
            email: result.email || `noemail+${Date.now()}@example.com`,
            phone: result.phone,
            skills: result.skills,
            status: newStatus,
            resume_url: normalizedSource,
            job_id: selectedJob || null,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        candidateId = newCandidate.id;

        // Update local results
        setLocalResults((prev) =>
          prev.map((item) =>
            item.source === result.source ? { ...item, candidateId } : item
          )
        );
      } else {
        // Update existing candidate
        const normalizedSource = normalizeResumePath(result.source) || result.source;
        const { error: updateError } = await supabase
          .from('candidates')
          .update({
            status: newStatus,
            full_name: result.name,
            phone: result.phone,
            skills: result.skills,
            job_id: selectedJob || null,
            resume_url: normalizedSource,
          })
          .eq('id', candidateId);

        if (updateError) throw updateError;
      }

      // Update local status state
      if (candidateId) {
        setCandidateStatuses((prev) => ({
          ...prev,
          [candidateId!]: newStatus,
        }));
      }

      // Log to shortlist_records if status is Shortlisted
      if (newStatus === 'Shortlisted') {
        const jobRecord = jobs.find((job: any) => job.id === selectedJob);
        const jobTitleSnapshot = jobRecord?.job_title ?? null;

        try {
          const { data: authData } = await supabase.auth.getUser();
          const shortlistedBy = authData?.user?.id ?? null;
          const normalizedResumeUrl = normalizeResumePath(result.source) || result.source;
          await supabase.from('shortlist_records').insert({
            candidate_snapname: result.name,
            candidate_snapemail: result.email,
            candidate_snapphone: result.phone,
            resume_url: normalizedResumeUrl,
            candidate_id: candidateId ?? null,
            job_id: selectedJob || null,
            job_snaptitle: jobTitleSnapshot,
            shortlisted_by: shortlistedBy,
            status: 'Shortlisted',
          });
        } catch (err) {
          console.warn('Failed to log shortlist record', err);
        }
      }

      // Log to activity_logs
      const statusAction = newStatus === 'Shortlisted' ? 'shortlisted' : 
                          newStatus === 'Rejected' ? 'rejected' : 
                          `status updated to ${newStatus.toLowerCase()}`;
      
      const { error: logError } = await supabase.from('activity_logs').insert({
        action: 'STATUS_UPDATED',
        details: `${result.name} has been ${statusAction}`,
      });

      if (logError) console.warn('Failed to log activity:', logError);

      toast({
        title: "Status Updated",
        description: `Candidate status updated to ${newStatus}.`,
      });

      // Invalidate queries to refresh dashboard and other pages
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });
      await queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      await queryClient.invalidateQueries({ queryKey: ['jobs-count'] });
      
      // Refetch to ensure fresh data
      await queryClient.refetchQueries({ queryKey: ["all-candidates-with-storage"] });
      
      // If shortlisted, navigate to shortlist page after a delay
      if (newStatus === 'Shortlisted') {
        setTimeout(() => {
          navigate('/shortlist');
        }, 1000);
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update candidate status.",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleReject = async (result: LocalResult) => {
    const processingKey = `${result.source}-reject`;
    setProcessingStatus(processingKey);
    
    try {
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Recruitment Hub</h1>
          <p className="text-muted-foreground mt-1">Manage job postings and match candidates</p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md"
        >
          <Plus className="h-4 w-4 mr-2" />
          {showForm ? "Cancel" : "Add New Job"}
        </Button>
      </div>

      {/* Job Management Section */}
      {showForm && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-xl">Enter Job Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveJob} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="job-title">Job Title</Label>
                  <Input
                    id="job-title"
                    name="job-title"
                    placeholder="e.g., Senior Software Engineer"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    name="department"
                    placeholder="e.g., Engineering"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Job Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Describe the role, responsibilities, and company culture..."
                  rows={5}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="skills">Required Skills (comma-separated)</Label>
                  <Input
                    id="skills"
                    name="skills"
                    placeholder="React, TypeScript, Node.js"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md w-full md:w-auto"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Job
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Job Postings</CardTitle>
          <p className="text-sm text-muted-foreground">All active and closed job positions</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Required Skills</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No jobs found. Create your first job posting!
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleJobs.map((job) => (
                    <TableRow key={job.id} className="hover:bg-accent/50 transition-colors">
                      <TableCell className="font-medium">{job.job_title}</TableCell>
                      <TableCell className="text-muted-foreground">{job.department}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {job.required_skills?.map((skill, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(job)}
                            title="Edit Job"
                            disabled={deletingJobId === job.id}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive disabled:opacity-50"
                            onClick={() => handleDeleteJob(job)}
                            title="Delete Job"
                            disabled={deletingJobId === job.id}
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

      {/* Candidate Matching Section */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Candidate Matching</CardTitle>
          <p className="text-sm text-muted-foreground">
            Match resumes by job required skills. Select a job to see the required skill match threshold.
            {minMatchesRequired
              ? ` Shows resumes with at least ${minMatchesRequired} skill match${minMatchesRequired > 1 ? "es" : ""}.`
              : ""}
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
            {localPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Matching…
              </>
            ) : (
              'Run Candidate Matching'
            )}
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
                    <TableHead>Stage</TableHead>
                    <TableHead>View/Download</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localResults.map((r, i) => {
                    const processingKey = `${r.source}-shortlist`;
                    const rejectKey = `${r.source}-reject`;
                    const statusKey = r.candidateId || r.source;
                    const isProcessing = processingStatus === processingKey || processingStatus === rejectKey;
                    const currentStatus = candidateStatuses[r.candidateId || ''] || 'Pending';
                    const isUpdatingStatus = updatingStatusId === statusKey;
                    
                    return (
                      <TableRow key={`${r.source}-${i}`}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-sm">{r.email || '—'}</TableCell>
                        <TableCell className="text-sm">{r.phone || '—'}</TableCell>
                        <TableCell className="text-sm">{r.skills.slice(0, 20).join(', ') || '—'}</TableCell>
                        <TableCell className="text-sm">{r.matched.join(', ')}</TableCell>
                        <TableCell>
                          <Select
                            value={currentStatus}
                            onValueChange={(value) => handleStatusUpdate(r, value)}
                            disabled={isUpdatingStatus}
                          >
                            <SelectTrigger className="w-[150px] h-8 text-xs font-medium">
                              <SelectValue>
                                <Badge className={`capitalize ${getStatusBadgeClass(currentStatus)}`}>
                                  {formatStatus(currentStatus)}
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialogMatch(r, i)}
                            className="w-full"
                            disabled={isProcessing || isUpdatingStatus}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
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

      {/* Edit Job Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Job Details</DialogTitle>
          </DialogHeader>
          <form className="space-y-6" onSubmit={handleUpdateJob}>
            <div className="space-y-2">
              <Label htmlFor="edit-job-title">Job Title</Label>
              <Input
                id="edit-job-title"
                value={editForm.job_title}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, job_title: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-department">Department</Label>
              <Input
                id="edit-department"
                value={editForm.department}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, department: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Job Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={4}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-skills">Required Skills (comma-separated)</Label>
              <Input
                id="edit-skills"
                value={editForm.required_skills}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, required_skills: e.target.value }))
                }
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-primary hover:opacity-90 text-primary-foreground">
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Candidate Dialog */}
      <Dialog
        open={editDialogOpenMatch}
        onOpenChange={(open) => {
          if (!open) {
            resetEditDialogMatch();
          } else {
            setEditDialogOpenMatch(true);
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
                value={editFormMatch.name}
                onChange={(e) => setEditFormMatch((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Candidate full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-result-email">Email</Label>
              <Input
                id="edit-result-email"
                type="email"
                value={editFormMatch.email}
                onChange={(e) => setEditFormMatch((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="candidate@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-result-phone">Phone</Label>
              <Input
                id="edit-result-phone"
                value={editFormMatch.phone}
                onChange={(e) => setEditFormMatch((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+91XXXXXXXXXX"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-result-skills">Skills (comma-separated)</Label>
              <Textarea
                id="edit-result-skills"
                value={editFormMatch.skills}
                onChange={(e) => setEditFormMatch((prev) => ({ ...prev, skills: e.target.value }))}
                rows={4}
                placeholder="react, javascript, node, sql"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetEditDialogMatch}>
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



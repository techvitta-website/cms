import { useMemo, useState } from "react";
import {
  GraduationCap,
  Upload,
  Loader2,
  Eye,
  Search,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { extractTextFromPDFFile, extractTextFromSupabaseStorage } from "@/lib/pdfExtractor";
import JSZip from "jszip";

// Where intern posts come from. Additive tags stored on candidates.source_portal
// and candidates.reference_source so legacy pages keep working unchanged.
const SOURCE_PORTALS = ["Internshala", "Naukri", "LinkedIn", "Referral", "College", "Other"];

const RESUME_BUCKETS = ["resumes-private", "resumes"];

const STATUS_OPTIONS = [
  "Pending",
  "Shortlisted",
  "Interview Scheduled",
  "Approved",
  "Offer Released",
  "Rejected",
];

type InternCandidate = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  resume_url: string | null;
  skills: string[] | null;
  college: string | null;
  degree: string | null;
  branch: string | null;
  graduation_year: number | null;
  cgpa: number | null;
  batch_tag: string | null;
  source_portal: string | null;
  screening_score: number | null;
  screening_tier: string | null;
  screening_rationale: string | null;
  intern_flags: string[] | null;
  resume_processed: boolean | null;
  screened_at: string | null;
};

const tierBadgeClass = (tier: string | null, score: number | null) => {
  const t = (tier || "").toLowerCase();
  if (t === "top") return "bg-emerald-100 text-emerald-700 border-none";
  if (t === "consider") return "bg-blue-100 text-blue-700 border-none";
  if (t === "review") return "bg-amber-100 text-amber-700 border-none";
  if (t === "low") return "bg-slate-100 text-slate-600 border-none";
  if (score == null) return "bg-slate-100 text-slate-500 border-none";
  return "bg-slate-100 text-slate-700 border-none";
};

const statusBadgeClass = (status: string) => {
  const key = (status || "").toLowerCase();
  if (key.includes("interview")) return "bg-amber-100 text-amber-700 border-none";
  if (key.includes("shortlist")) return "bg-blue-100 text-blue-700 border-none";
  if (key.includes("approve") || key.includes("offer")) return "bg-emerald-100 text-emerald-700 border-none";
  if (key.includes("reject")) return "bg-rose-100 text-rose-700 border-none";
  return "bg-slate-100 text-slate-700 border-none";
};

const sanitizeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 80);

const nameFromFile = (name: string) => {
  const base = name
    .replace(/\.(pdf|docx?)$/i, "")
    .replace(/^\d+[_-]?\d*[_-]?\d*[_-]?/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(resume|cv|curriculum|vitae)\b/gi, "")
    .trim();
  return base.length >= 2 ? base : name.replace(/\.(pdf|docx?)$/i, "");
};

export default function InternScreening() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Upload form state
  const [batchName, setBatchName] = useState("");
  const [sourcePortal, setSourcePortal] = useState<string>("Internshala");
  const [targetJobId, setTargetJobId] = useState<string>("");
  const [targetSkillsText, setTargetSkillsText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  // Review filters
  const [query, setQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState<string>("__ALL__");
  const [tierFilter, setTierFilter] = useState<string>("__ALL__");
  const [statusFilter, setStatusFilter] = useState<string>("__ALL__");
  const [minScore, setMinScore] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Jobs (for optional job-aware scoring). Reuses the existing jobs table.
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_title, required_skills")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // The ENTIRE candidate database for the review queue (not just batches).
  const {
    data: candidates = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["intern-candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select(
          "id, full_name, email, phone, status, resume_url, skills, college, degree, branch, graduation_year, cgpa, batch_tag, source_portal, screening_score, screening_tier, screening_rationale, intern_flags, resume_processed, screened_at",
        )
        .order("screening_score", { ascending: false, nullsFirst: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as InternCandidate[];
    },
  });

  // Database-wide screening stats.
  const unscoredCount = useMemo(
    () => candidates.filter((c) => c.resume_url && !c.screened_at).length,
    [candidates],
  );
  const failedCount = useMemo(
    () => candidates.filter((c) => (c.intern_flags ?? []).includes("screen_failed")).length,
    [candidates],
  );

  const batchOptions = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => {
      if (c.batch_tag) set.add(c.batch_tag);
    });
    return Array.from(set).sort();
  }, [candidates]);

  const effectiveTargetSkills = useMemo(() => {
    const manual = targetSkillsText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (manual.length > 0) return manual;
    const job = jobs.find((j: any) => String(j.id) === targetJobId);
    if (job && Array.isArray(job.required_skills)) {
      return job.required_skills.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean);
    }
    return [];
  }, [targetSkillsText, targetJobId, jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = minScore.trim() === "" ? null : Number(minScore);
    return candidates.filter((c) => {
      if (batchFilter !== "__ALL__") {
        if (batchFilter === "__NOBATCH__") {
          if (c.batch_tag) return false;
        } else if (c.batch_tag !== batchFilter) {
          return false;
        }
      }
      if (tierFilter !== "__ALL__" && (c.screening_tier || "Unscored") !== tierFilter) return false;
      if (statusFilter !== "__ALL__" && (c.status || "Pending") !== statusFilter) return false;
      if (min != null && !Number.isNaN(min) && (c.screening_score ?? -1) < min) return false;
      if (q) {
        const hay = `${c.full_name ?? ""} ${c.email ?? ""} ${c.college ?? ""} ${c.branch ?? ""} ${(c.skills ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [candidates, query, batchFilter, tierFilter, statusFilter, minScore]);

  // Expand the selected files into a flat list of PDFs, unpacking any .zip
  // (Naukri Resdex / Internshala bulk exports often come as a ZIP of resumes).
  async function expandToPdfs(selected: File[]): Promise<File[]> {
    const out: File[] = [];
    for (const f of selected) {
      const isZip = /\.zip$/i.test(f.name) || f.type === "application/zip" || f.type === "application/x-zip-compressed";
      if (isZip) {
        try {
          const zip = await JSZip.loadAsync(f);
          const entries = Object.values(zip.files);
          for (const entry of entries) {
            if (entry.dir) continue;
            if (!/\.pdf$/i.test(entry.name)) continue;
            const blob = await entry.async("blob");
            const base = entry.name.split("/").pop() || entry.name;
            out.push(new File([blob], base, { type: "application/pdf" }));
          }
        } catch (err) {
          console.warn(`Could not read ZIP ${f.name}:`, err);
          toast({
            title: `Couldn't open ${f.name}`,
            description: "The ZIP may be corrupt or password-protected.",
            variant: "destructive",
          });
        }
      } else if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        out.push(f);
      }
    }
    return out;
  }

  async function uploadOne(file: File, index: number): Promise<string> {
    const safe = sanitizeFileName(file.name);
    const fileName = `${Date.now()}_${index}_${safe}`;
    let lastError: any = null;
    for (const bucket of RESUME_BUCKETS) {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { upsert: false, contentType: file.type || "application/pdf" });
      if (!error) return `${bucket}/${fileName}`;
      lastError = error;
    }
    throw lastError ?? new Error("Upload failed");
  }

  const handleUploadAndScreen = async () => {
    if (!batchName.trim()) {
      toast({ title: "Batch name required", description: "Give this intake a name so you can find it later." });
      return;
    }
    if (files.length === 0) {
      toast({ title: "No files selected", description: "Choose one or more PDF resumes to upload." });
      return;
    }
    setUploading(true);
    const batch = batchName.trim();
    const createdItems: { candidateId: string; resumeText: string; fileName: string }[] = [];
    try {
      // 0) Unpack any ZIPs into a flat list of PDFs.
      setProgress("Reading files…");
      const pdfs = await expandToPdfs(files);
      if (pdfs.length === 0) {
        toast({ title: "No PDFs found", description: "Select PDF resumes, or a ZIP that contains PDFs.", variant: "destructive" });
        setUploading(false);
        setProgress(null);
        return;
      }

      // 1) Record the batch (best-effort; screening still proceeds if this fails).
      try {
        const { data: authData } = await supabase.auth.getUser();
        await supabase.from("intern_batches").insert({
          name: batch,
          source_portal: sourcePortal,
          target_role: jobs.find((j: any) => String(j.id) === targetJobId)?.job_title ?? null,
          target_job_id: targetJobId || null,
          candidate_count: pdfs.length,
          created_by: authData?.user?.id ?? null,
        });
      } catch (err) {
        console.warn("intern_batches insert skipped:", err);
      }

      // 2) Upload each resume + create a candidate row tagged to this batch.
      let done = 0;
      for (let i = 0; i < pdfs.length; i++) {
        const file = pdfs[i];
        setProgress(`Uploading ${done + 1} / ${pdfs.length}: ${file.name}`);
        try {
          const resumeUrl = await uploadOne(file, i);
          // Extract the PDF text in the browser (no server-side PDF library needed).
          let resumeText = "";
          try {
            resumeText = await extractTextFromPDFFile(file);
          } catch (err) {
            console.warn(`Text extraction failed for ${file.name}:`, err);
          }
          const { data, error } = await supabase
            .from("candidates")
            .insert({
              full_name: nameFromFile(file.name),
              // candidates.email is NOT NULL + UNIQUE; use a unique placeholder
              // that the screener overwrites once it extracts the real email.
              email: `noemail+${Date.now()}_${i}@example.com`,
              status: "Pending",
              resume_url: resumeUrl,
              resume_processed: false,
              reference_source: sourcePortal,
              source_portal: sourcePortal,
              batch_tag: batch,
            })
            .select("id")
            .single();
          if (error) throw error;
          if (data?.id) {
            createdItems.push({ candidateId: data.id, resumeText, fileName: file.name });
          }
        } catch (err: any) {
          console.warn(`Failed to upload/create ${file.name}:`, err);
          toast({
            title: `Skipped ${file.name}`,
            description: err?.message || "Upload failed",
            variant: "destructive",
          });
        }
        done++;
      }

      if (createdItems.length === 0) {
        toast({ title: "Nothing uploaded", description: "No resumes were saved.", variant: "destructive" });
        return;
      }

      // 3) Kick off AI screening for the new candidates (send extracted text).
      setProgress(`Screening ${createdItems.length} resume(s) with AI…`);
      const { data: screenData, error: screenError } = await supabase.functions.invoke("intern-screen", {
        body: {
          candidates: createdItems,
          targetSkills: effectiveTargetSkills,
        },
      });

      if (screenError) {
        toast({
          title: "Uploaded, screening pending",
          description:
            "Resumes were saved but AI scoring failed to run. You can re-run screening once the intern-screen function is deployed.",
          variant: "destructive",
        });
      } else {
        const screened = (screenData as any)?.screened ?? createdItems.length;
        toast({
          title: "Batch screened",
          description: `${screened} of ${createdItems.length} resume(s) scored and ranked.`,
        });
      }

      // Reset the picker; keep batch name for convenience.
      setFiles([]);
      setBatchFilter(batch);
      await queryClient.invalidateQueries({ queryKey: ["intern-candidates"] });
      await refetch();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Something went wrong during upload.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const handleRescore = async () => {
    const targets = filtered.filter((c) => c.resume_url);
    if (targets.length === 0) return;
    setUploading(true);
    setProgress(`Re-scoring ${targets.length} candidate(s)…`);
    try {
      // Re-read each resume's text in the browser, then send to the function.
      const payload: { candidateId: string; resumeText: string; fileName: string }[] = [];
      for (let i = 0; i < targets.length; i++) {
        const c = targets[i];
        setProgress(`Reading ${i + 1} / ${targets.length}…`);
        let resumeText = "";
        try {
          const [bucket, ...rest] = (c.resume_url as string).split("/");
          const fileName = rest.join("/");
          resumeText = await extractTextFromSupabaseStorage(supabase, bucket, fileName);
        } catch (err) {
          console.warn("Re-score text extraction failed:", err);
        }
        payload.push({ candidateId: c.id, resumeText, fileName: c.resume_url || "" });
      }
      setProgress(`Scoring ${payload.length} candidate(s)…`);
      const { error } = await supabase.functions.invoke("intern-screen", {
        body: { candidates: payload, targetSkills: effectiveTargetSkills },
      });
      if (error) throw error;
      toast({ title: "Re-scored", description: `${payload.length} candidate(s) updated.` });
      await queryClient.invalidateQueries({ queryKey: ["intern-candidates"] });
      await refetch();
    } catch (err: any) {
      toast({ title: "Re-score failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  // Screen the ENTIRE database server-side: the edge function downloads each
  // stored resume, Gemini reads it, and scores land on the candidate row.
  // Small batches per call; we loop until nothing is left.
  const runStorageScreening = async (candidateIds?: string[]) => {
    setUploading(true);
    let done = 0;
    let stalled = 0;
    try {
      const idsQueue = candidateIds ? [...candidateIds] : null;
      for (let round = 0; round < 60; round++) {
        const body: Record<string, unknown> = {
          fromStorage: true,
          limit: 5,
          targetSkills: effectiveTargetSkills,
        };
        if (idsQueue) {
          if (idsQueue.length === 0) break;
          body.candidateIds = idsQueue.splice(0, 5);
        } else {
          body.onlyUnscored = true;
        }
        setProgress(`Screening database with AI… ${done} done`);
        const { data, error } = await supabase.functions.invoke("intern-screen", { body });
        if (error) throw error;
        const screened = Number((data as any)?.screened ?? 0);
        const processed = Number((data as any)?.processed ?? 0);
        const remaining = Number((data as any)?.remaining ?? 0);
        done += screened;
        if (!idsQueue) {
          if (remaining === 0) break;
          if (processed === 0) break;
          // If a whole round produced no successes (e.g. AI quota exhausted),
          // stop rather than burning through every candidate as "failed".
          if (screened === 0) {
            stalled++;
            if (stalled >= 2) {
              toast({
                title: "AI limit reached",
                description: `${done} screened. The AI quota seems exhausted — use "Retry failed" later to finish the rest.`,
                variant: "destructive",
              });
              break;
            }
          } else {
            stalled = 0;
          }
        }
      }
      if (done > 0) {
        toast({ title: "Database screening finished", description: `${done} candidate(s) scored and ranked.` });
      }
      await queryClient.invalidateQueries({ queryKey: ["intern-candidates"] });
      await refetch();
    } catch (err: any) {
      toast({ title: "Screening failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const handleScreenDatabase = () => runStorageScreening();

  const handleRetryFailed = () => {
    const ids = candidates
      .filter((c) => (c.intern_flags ?? []).includes("screen_failed") && c.resume_url)
      .map((c) => c.id);
    if (ids.length === 0) return;
    return runStorageScreening(ids);
  };

  const handleStatusChange = async (candidate: InternCandidate, newStatus: string) => {
    setUpdatingId(candidate.id);
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ status: newStatus })
        .eq("id", candidate.id);
      if (error) throw error;

      try {
        await supabase.from("activity_logs").insert({
          action: "STATUS_UPDATED",
          details: `${candidate.full_name ?? "Intern"} status set to ${newStatus} (intern screening)`,
        });
      } catch (err) {
        console.warn("activity log skipped:", err);
      }

      toast({ title: "Status updated", description: `${candidate.full_name ?? "Candidate"} → ${newStatus}` });
      await queryClient.invalidateQueries({ queryKey: ["intern-candidates"] });
      await queryClient.invalidateQueries({ queryKey: ["shortlist-candidates"] });
      await refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update status.", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleView = async (resumeUrl: string | null) => {
    if (!resumeUrl) {
      toast({ title: "No resume", description: "This candidate has no resume file." });
      return;
    }
    try {
      const [bucket, ...rest] = resumeUrl.split("/");
      const fileName = rest.join("/");
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(fileName, 3600);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch (err: any) {
      toast({ title: "Could not open resume", description: err?.message || String(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-md">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Intern Screening</h1>
          <p className="text-muted-foreground mt-1">
            Bulk-upload student resumes from Internshala, Naukri, LinkedIn and more — AI ranks them for you.
          </p>
        </div>
      </div>

      {/* Bulk upload */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Upload className="h-5 w-5" /> Upload a batch
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select multiple PDF resumes — or a ZIP exported from Naukri Resdex / Internshala — at once. Each is
            uploaded, parsed and scored on skills, projects, coursework, CGPA and certifications.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="batch-name">Batch name</Label>
              <Input
                id="batch-name"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g., Summer 2026 – Web Dev"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-portal">Source</Label>
              <Select value={sourcePortal} onValueChange={setSourcePortal}>
                <SelectTrigger id="source-portal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_PORTALS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-job">Score against role (optional)</Label>
              <Select value={targetJobId || "__NONE__"} onValueChange={(v) => setTargetJobId(v === "__NONE__" ? "" : v)}>
                <SelectTrigger id="target-job">
                  <SelectValue placeholder="General intern rubric" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">General intern rubric</SelectItem>
                  {jobs.map((job: any) => (
                    <SelectItem key={job.id} value={String(job.id)}>
                      {job.job_title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-skills">Target skills (optional)</Label>
              <Input
                id="target-skills"
                value={targetSkillsText}
                onChange={(e) => setTargetSkillsText(e.target.value)}
                placeholder="react, python, sql"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resume-files">Resume PDFs or a ZIP</Label>
            <Input
              id="resume-files"
              type="file"
              accept="application/pdf,.pdf,.zip,application/zip,application/x-zip-compressed"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <p className="text-xs text-muted-foreground">
              {files.length > 0
                ? `${files.length} item(s) selected`
                : "Select multiple PDFs, or a single ZIP exported from Naukri Resdex / Internshala."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleUploadAndScreen}
              disabled={uploading}
              className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Upload & Screen
                </>
              )}
            </Button>
            {progress && <span className="text-sm text-muted-foreground">{progress}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Review queue */}
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Ranked review queue — entire database</CardTitle>
              <p className="text-sm text-muted-foreground">
                {filtered.length} of {candidates.length} candidate(s) in the database. Highest AI score first. Nobody is auto-rejected.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {unscoredCount > 0 && (
                <Button
                  size="sm"
                  onClick={handleScreenDatabase}
                  disabled={uploading}
                  className="bg-gradient-primary hover:opacity-90 text-primary-foreground"
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Screen database ({unscoredCount})
                </Button>
              )}
              {failedCount > 0 && (
                <Button variant="outline" size="sm" onClick={handleRetryFailed} disabled={uploading}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Retry failed ({failedCount})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleRescore} disabled={uploading || filtered.length === 0}>
                <RefreshCw className="h-4 w-4 mr-2" /> Re-score shown
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, college, skill…"
                className="pl-8"
              />
            </div>
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All batches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All batches</SelectItem>
                <SelectItem value="__NOBATCH__">No batch (older records)</SelectItem>
                {batchOptions.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All tiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All tiers</SelectItem>
                <SelectItem value="Top">Top</SelectItem>
                <SelectItem value="Consider">Consider</SelectItem>
                <SelectItem value="Review">Review</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="Min score"
              min={0}
              max={100}
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Education</TableHead>
                  <TableHead>CGPA</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No candidates yet. Upload a batch above to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c, idx) => {
                    const status = c.status || "Pending";
                    return (
                      <TableRow key={c.id} className="hover:bg-accent/50 transition-colors">
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">{c.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{c.email || "no email"}</div>
                          {c.intern_flags && c.intern_flags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.intern_flags.map((f) => (
                                <span key={f} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                                  {f.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{c.branch || c.degree || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {[c.college, c.graduation_year].filter(Boolean).join(" · ") || ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{c.cgpa ?? "—"}</TableCell>
                        <TableCell>
                          {c.screening_score == null ? (
                            <Badge className="bg-slate-100 text-slate-500 border-none">unscored</Badge>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <Badge className={tierBadgeClass(c.screening_tier, c.screening_score)}>
                                {c.screening_score} · {c.screening_tier || "—"}
                              </Badge>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs max-w-[220px]">
                          {(c.skills ?? []).slice(0, 8).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{c.source_portal || c.batch_tag || "—"}</TableCell>
                        <TableCell>
                          <Select
                            value={status}
                            onValueChange={(v) => handleStatusChange(c, v)}
                            disabled={updatingId === c.id}
                          >
                            <SelectTrigger className="w-[160px] h-8 text-xs">
                              <SelectValue>
                                <Badge className={`capitalize ${statusBadgeClass(status)}`}>{status}</Badge>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => handleView(c.resume_url)}>
                            <Eye className="h-3 w-3 mr-1" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

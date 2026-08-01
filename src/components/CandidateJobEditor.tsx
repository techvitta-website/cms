import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Loader2, Check, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CandidateJobEditorProps {
  candidateId: string;
  /** Current job title for display (may be null/undefined when unassigned). */
  jobTitle?: string | null;
  /** Styling for the wrapping element so it can slot into row/card layouts. */
  className?: string;
}

/**
 * Inline editor for a candidate's applied job position. Shows the current job
 * title with a small pencil button; clicking it opens a popover listing all
 * jobs so the position can be corrected or assigned (many imported candidates
 * have none). Updates candidates.job_id and refreshes every candidate list.
 */
export default function CandidateJobEditor({
  candidateId,
  jobTitle,
  className,
}: CandidateJobEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);

  // Load jobs lazily — only once a popover is opened somewhere (shared cache).
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs-for-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_title, department")
        .order("job_title", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const assignJob = async (jobId: string | null, label: string) => {
    setSavingJobId(jobId ?? "none");
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ job_id: jobId })
        .eq("id", candidateId);
      if (error) throw error;

      await queryClient.invalidateQueries();
      toast({
        title: "Job position updated",
        description: jobId ? `Candidate moved to ${label}.` : "Job position cleared.",
      });
      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update job position.",
        variant: "destructive",
      });
    } finally {
      setSavingJobId(null);
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${className || ""}`}>
      <span
        className="text-xs sm:text-sm text-muted-foreground truncate"
        title={jobTitle || "No job assigned"}
      >
        {jobTitle || "—"}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
            title="Edit job position"
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-2"
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
            Assign job position
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No jobs found. Create one in the Recruitment Hub first.
            </p>
          ) : (
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {jobs.map((job: any) => {
                const selected = job.job_title === jobTitle;
                const saving = savingJobId === job.id;
                return (
                  <Button
                    key={job.id}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 h-8 font-normal"
                    disabled={!!savingJobId}
                    onClick={() => assignJob(job.id, job.job_title)}
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : selected ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{job.job_title}</span>
                    {job.department && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {job.department}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, RefreshCw, Loader2, GraduationCap, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// AI Screening status panel for the Dashboard.
// Shows, at a glance, how much of the candidate database has been AI-screened
// (the "sync" state), with run buttons to screen pending resumes or retry
// failures — same server-side engine the Intern Screening page uses.
// Fully self-contained and additive: nothing else on the Dashboard changes.
// ---------------------------------------------------------------------------

type Row = {
  id: string;
  resume_url: string | null;
  screening_score: number | null;
  screening_tier: string | null;
  intern_flags: string[] | null;
  screened_at: string | null;
};

export default function AIScreeningStatus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["ai-screening-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id, resume_url, screening_score, screening_tier, intern_flags, screened_at")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const stats = useMemo(() => {
    const withResume = rows.filter((r) => r.resume_url);
    const scored = rows.filter((r) => r.screening_score != null);
    const failed = rows.filter((r) => (r.intern_flags ?? []).includes("screen_failed") && r.resume_url);
    const pending = withResume.filter((r) => !r.screened_at);
    const tier = (t: string) => scored.filter((r) => (r.screening_tier ?? "") === t).length;
    let lastSync: string | null = null;
    for (const r of rows) {
      if (r.screened_at && (!lastSync || r.screened_at > lastSync)) lastSync = r.screened_at;
    }
    return {
      total: rows.length,
      withResume: withResume.length,
      scored: scored.length,
      top: tier("Top"),
      consider: tier("Consider"),
      review: tier("Review"),
      low: tier("Low"),
      pending: pending.length,
      failed: failed.length,
      failedIds: failed.map((r) => r.id),
      lastSync,
    };
  }, [rows]);

  const synced = stats.pending === 0 && stats.failed === 0 && stats.withResume > 0;

  // Loop the server-side storage screening in small batches.
  const run = async (candidateIds?: string[]) => {
    setRunning(true);
    let done = 0;
    let stalled = 0;
    try {
      const idsQueue = candidateIds ? [...candidateIds] : null;
      for (let round = 0; round < 60; round++) {
        const body: Record<string, unknown> = { fromStorage: true, limit: 5 };
        if (idsQueue) {
          if (idsQueue.length === 0) break;
          body.candidateIds = idsQueue.splice(0, 5);
        } else {
          body.onlyUnscored = true;
        }
        setProgress(`AI screening… ${done} done`);
        const { data, error } = await supabase.functions.invoke("intern-screen", { body });
        if (error) throw error;
        const screened = Number((data as any)?.screened ?? 0);
        const processed = Number((data as any)?.processed ?? 0);
        const remaining = Number((data as any)?.remaining ?? 0);
        done += screened;
        if (!idsQueue) {
          if (remaining === 0 || processed === 0) break;
          if (screened === 0) {
            stalled++;
            if (stalled >= 2) {
              toast({
                title: "AI limit reached",
                description: `${done} screened. Quota looks exhausted — try "Retry failed" later.`,
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
        toast({ title: "Screening finished", description: `${done} candidate(s) scored.` });
      }
      await queryClient.invalidateQueries({ queryKey: ["ai-screening-status"] });
      await queryClient.invalidateQueries({ queryKey: ["intern-candidates"] });
      await refetch();
    } catch (err: any) {
      toast({ title: "Screening failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const lastSyncText = stats.lastSync
    ? new Date(stats.lastSync).toLocaleString(undefined, {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "never";

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> AI Resume Screening — sync status
          </CardTitle>
          {synced ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-none gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> All synced
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 border-none gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {stats.pending > 0 ? `${stats.pending} pending` : `${stats.failed} failed`}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {stats.scored} of {stats.withResume} resumes scored · {stats.total} candidates in database · last sync: {lastSyncText}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-emerald-50 px-3 py-2">
            <div className="text-xl font-bold text-emerald-700">{stats.top}</div>
            <div className="text-xs text-emerald-700/80">Top</div>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-2">
            <div className="text-xl font-bold text-blue-700">{stats.consider}</div>
            <div className="text-xs text-blue-700/80">Consider</div>
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <div className="text-xl font-bold text-amber-700">{stats.review}</div>
            <div className="text-xs text-amber-700/80">Review</div>
          </div>
          <div className="rounded-lg bg-slate-100 px-3 py-2">
            <div className="text-xl font-bold text-slate-700">{stats.pending + stats.failed}</div>
            <div className="text-xs text-slate-600">Unscreened / failed</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stats.pending > 0 && (
            <Button
              size="sm"
              onClick={() => run()}
              disabled={running}
              className="bg-gradient-primary hover:opacity-90 text-primary-foreground"
            >
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Screen pending ({stats.pending})
            </Button>
          )}
          {stats.failed > 0 && (
            <Button variant="outline" size="sm" onClick={() => run(stats.failedIds)} disabled={running}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retry failed ({stats.failed})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/intern-screening")} disabled={running}>
            <GraduationCap className="h-4 w-4 mr-2" /> Open ranked queue
          </Button>
          {progress && <span className="text-sm text-muted-foreground">{progress}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

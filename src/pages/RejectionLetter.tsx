import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileX2, History, Search, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import RejectionLetterGenerator, {
  RejectionCandidate,
} from "@/components/RejectionLetterGenerator";

interface RejectionLetterRow {
  id: string;
  candidate_id: string | null;
  rejection_letter_url: string | null;
  file_name: string | null;
  email: string | null;
  email_sent: boolean | null;
  created_at: string;
  candidates?: { id: string; full_name: string; email: string } | null;
}

export default function RejectionLetter() {
  const [activeTab, setActiveTab] = useState("generate");
  const [historySearch, setHistorySearch] = useState("");

  // Rejection letters follow working feedback: only candidates rejected in
  // feedback (feedback_decision = 'Reject', or status 'Rejected') are eligible.
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["rejected-candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select(
          `id, full_name, email, phone, status, job_id, feedback_rating, feedback_decision,
           jobs ( job_title, department )`,
        )
        .or("feedback_decision.eq.Reject,status.eq.Rejected")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RejectionCandidate[];
    },
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["rejection-letters-history"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("rejection_letters") as any)
        .select(
          `id, candidate_id, rejection_letter_url, file_name, email, email_sent, created_at,
           candidates ( id, full_name, email )`,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RejectionLetterRow[];
    },
  });

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (h) =>
        h.candidates?.full_name?.toLowerCase().includes(q) ||
        (h.email ?? "").toLowerCase().includes(q),
    );
  }, [history, historySearch]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Rejection Letter</h1>
        <p className="text-muted-foreground mt-1">
          Generate and send rejection letters to candidates not approved in feedback.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <FileX2 className="h-4 w-4" />
            Auto-Generate &amp; Send
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-6">
          <RejectionLetterGenerator candidates={candidates} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-xl">Sent Rejection Letters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="pl-9"
                />
              </div>
              {historyLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredHistory.length === 0 ? (
                <p className="text-center text-muted-foreground py-10">No rejection letters yet.</p>
              ) : (
                <div className="grid gap-3">
                  {filteredHistory.map((h) => (
                    <div
                      key={h.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {h.candidates?.full_name || h.email || "Candidate"}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {h.email} · {format(new Date(h.created_at), "dd MMM yyyy, HH:mm")} ·{" "}
                          {h.email_sent ? "Emailed" : "Stored (email failed)"}
                        </p>
                      </div>
                      {h.rejection_letter_url && (
                        <Button asChild variant="outline" size="sm" className="shrink-0">
                          <a href={h.rejection_letter_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View PDF
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

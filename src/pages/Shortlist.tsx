import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CandidateCard from "@/components/CandidateCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, Search, History, MessageSquare } from "lucide-react";
import { openResume } from "@/lib/resume";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const COMPANY_NAME = "Techvitta Innovations Pvt Ltd";

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  status: string;
  job_id: string | null;
  shortlist_comment?: string | null;
  jobs?: {
    job_title: string;
  } | null;
}

interface EmailHistoryEntry {
  id: string;
  action: string;
  details: string;
  created_at: string;
}

interface EmailReply {
  id: string;
  candidate_id: string | null;
  candidate_email: string;
  candidate_name: string | null;
  subject: string | null;
  reply_content: string;
  received_at: string;
  status: string;
  email_stage: string | null;
}

export default function Shortlist() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"shortlist" | "history">("shortlist");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<EmailHistoryEntry[]>([]);
  const [historyCandidate, setHistoryCandidate] = useState<Candidate | null>(null);
  const [sentEmailIds, setSentEmailIds] = useState<string[]>([]);
  const [repliesDialogOpen, setRepliesDialogOpen] = useState(false);
  const [selectedCandidateForReplies, setSelectedCandidateForReplies] = useState<Candidate | null>(null);

  // Fetch candidates with job information
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["shortlist-candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select(`
          id,
          full_name,
          email,
          phone,
          resume_url,
          status,
          job_id,
          shortlist_comment,
          jobs (
            job_title
          )
        `)
        .eq("status", "Shortlisted")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Candidate[];
    },
  });

  useEffect(() => {
    setCommentDrafts((prev) => {
      const updated = { ...prev };
      let changed = false;

      candidates.forEach((candidate) => {
        if (!(candidate.id in updated)) {
          updated[candidate.id] = candidate.shortlist_comment || "";
          changed = true;
        }
      });

      const candidateIds = new Set(candidates.map((c) => c.id));
      Object.keys(updated).forEach((id) => {
        if (!candidateIds.has(id)) {
          delete updated[id];
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, [candidates]);

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      candidateId,
      newStatus,
      candidateEmail,
      candidateName,
      comment,
      positionTitle,
    }: {
      candidateId: string;
      newStatus: string;
      candidateEmail: string;
      candidateName: string;
      positionTitle?: string | null;
      comment?: string;
    }) => {
      // Update candidate status
      const { error: updateError } = await supabase
        .from("candidates")
        .update({
          status: newStatus,
          shortlist_comment: comment?.trim() || null,
        })
        .eq("id", candidateId);

      if (updateError) throw updateError;

      // Log activity
      const { error: logError } = await supabase.from("activity_logs").insert({
        action: "STATUS_UPDATED",
        details: `${candidateName} status updated to ${newStatus}${
          comment ? ` (Note: ${comment.trim()})` : ""
        }`,
      });

      if (logError) throw logError;

      // Send email if status changed to Shortlisted
      if (newStatus === "Shortlisted") {
        try {
          const { data, error: emailError } = await supabase.functions.invoke("send-email", {
            body: {
              to: candidateEmail,
              candidateName: candidateName,
              emailType: "shortlist",
              data: {
                positionTitle: positionTitle || "Candidate",
                companyName: COMPANY_NAME,
              },
            },
          });

          if (emailError) {
            console.error("Failed to send shortlist email:", emailError);
            // Don't throw error, just log it - status update should still succeed
          } else if (!data?.success) {
            console.error("Email sending failed:", data?.error);
          }
        } catch (emailErr) {
          console.error("Error sending shortlist email:", emailErr);
          // Don't throw - status update is more important
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["shortlist-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["shortlisted-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-history"] });
      
      // If status changed to Shortlisted, redirect to Interview page after 1 second
      if (variables.newStatus === "Shortlisted") {
        toast({
          title: "Status Updated",
          description: "Candidate has been shortlisted. Redirecting to Interview page...",
        });
        setTimeout(() => {
          navigate("/interview");
        }, 1000);
      } else {
        toast({
          title: "Status Updated",
          description: "Candidate status has been updated successfully.",
        });
      }
      setUpdatingStatus(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
      setUpdatingStatus(null);
    },
  });

  const handleStatusChange = (candidateId: string, newStatus: string) => {
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate) return;

    setUpdatingStatus(candidateId);
    updateStatusMutation.mutate({
      candidateId,
      newStatus,
      candidateEmail: candidate.email,
      candidateName: candidate.full_name,
      positionTitle: candidate.jobs?.job_title || null,
      comment: candidate.shortlist_comment ?? "",
    });
  };

  const saveCommentMutation = useMutation({
    mutationFn: async ({
      candidateId,
      comment,
      candidateName,
    }: {
      candidateId: string;
      comment: string;
      candidateName: string;
    }) => {
      const { error: updateError } = await supabase
        .from("candidates")
        .update({ shortlist_comment: comment.trim() || null })
        .eq("id", candidateId);

      if (updateError) throw updateError;

      const { error: logError } = await supabase.from("activity_logs").insert({
        action: "SHORTLIST_COMMENT_UPDATED",
        details: `${candidateName} shortlist comment updated`,
      });

      if (logError) throw logError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["shortlist-candidates"] });
      toast({
        title: "Comment saved",
        description: "Your note has been stored successfully.",
      });
      setSavingCommentId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save comment",
        variant: "destructive",
      });
      setSavingCommentId(null);
    },
  });

  const handleCommentChange = (candidateId: string, value: string) => {
    setCommentDrafts((prev) => ({
      ...prev,
      [candidateId]: value,
    }));
  };

  const handleSaveComment = (candidateId: string) => {
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate) return;

    setSavingCommentId(candidateId);
    saveCommentMutation.mutate({
      candidateId,
      comment: commentDrafts[candidateId] ?? "",
      candidateName: candidate.full_name,
    });
  };

  const sendShortlistEmailMutation = useMutation({
    mutationFn: async (candidate: Candidate) => {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: candidate.email,
          candidateName: candidate.full_name,
          emailType: "shortlist",
          data: {
            positionTitle: candidate.jobs?.job_title || "Candidate",
            companyName: COMPANY_NAME,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to send email");
      }
    },
    onSuccess: async (_, candidate) => {
      // Log shortlist email in activity logs so we can show history per candidate
      try {
        const { error: logError } = await supabase.from("activity_logs").insert({
          action: "SHORTLIST_EMAIL_SENT",
          details: `Shortlist email sent to ${candidate.full_name} (${candidate.email})`,
        });
        if (logError) {
          console.error("Failed to log shortlist email activity:", logError);
        }
      } catch (logErr) {
        console.error("Error logging shortlist email activity:", logErr);
      }

      // Mark this candidate as already emailed (for this session)
      setSentEmailIds((prev) =>
        prev.includes(candidate.id) ? prev : [...prev, candidate.id],
      );

      toast({
        title: "Email Sent",
        description: `Shortlist email has been sent to ${candidate.email}`,
      });
      setSendingEmailId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
      setSendingEmailId(null);
    },
  });

  const handleSendShortlistEmail = async (candidate: Candidate) => {
    // If we've already sent a shortlist email to this candidate in this session,
    // show a warning and do not send again.
    if (sentEmailIds.includes(candidate.id)) {
      toast({
        title: "Already sent",
        description: "Shortlist email already sent for this candidate.",
      });
      return;
    }

    setSendingEmailId(candidate.id);

    // Check persistent history in activity_logs so this also works after refresh
    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("action", "SHORTLIST_EMAIL_SENT")
        .ilike("details", `%${candidate.email}%`)
        .limit(1);

      if (error) {
        console.error("Failed to check shortlist email history:", error);
      } else if (data && data.length > 0) {
        // Mark as already sent in this session too
        setSentEmailIds((prev) =>
          prev.includes(candidate.id) ? prev : [...prev, candidate.id],
        );
        toast({
          title: "Already sent",
          description: "Shortlist email already sent for this candidate.",
        });
        setSendingEmailId(null);
        return;
      }
    } catch (err) {
      console.error("Error checking shortlist email history:", err);
    }

    sendShortlistEmailMutation.mutate(candidate);
  };

  const handleViewShortlistHistory = async (candidate: Candidate) => {
    setHistoryCandidate(candidate);
    setHistoryOpen(true);
    setHistoryLoading(true);

    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("action", "SHORTLIST_EMAIL_SENT")
      .ilike("details", `%${candidate.email}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to load shortlist email history:", error);
      toast({
        title: "Error",
        description: "Failed to load shortlist email history.",
        variant: "destructive",
      });
      setHistoryEntries([]);
    } else {
      setHistoryEntries((data || []) as EmailHistoryEntry[]);
    }

    setHistoryLoading(false);
  };

  const handleViewResume = async (resumeUrl: string) => {
    await openResume(resumeUrl);
  };

  // Fetch email replies for shortlist stage
  const { data: emailReplies = [] } = useQuery({
    queryKey: ["email-replies-shortlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_replies")
        .select("*")
        .eq("email_stage", "shortlist")
        .order("received_at", { ascending: false });

      if (error) throw error;
      return (data || []) as EmailReply[];
    },
  });

  const handleViewReplies = (candidate: Candidate) => {
    setSelectedCandidateForReplies(candidate);
    setRepliesDialogOpen(true);
  };

  const getCandidateReplies = (candidate: Candidate) => {
    return emailReplies.filter(
      (reply) => reply.candidate_email.toLowerCase() === candidate.email.toLowerCase()
    );
  };

  // Fetch shortlist email history for all candidates
  const { data: shortlistHistory = [], isLoading: isShortlistHistoryLoading } = useQuery({
    queryKey: ["shortlist-email-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("action", "SHORTLIST_EMAIL_SENT")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return data || [];
    },
  });

  const filteredShortlistHistory = useMemo(() => {
    if (!historySearchTerm.trim()) return shortlistHistory;
    const searchLower = historySearchTerm.toLowerCase();
    return shortlistHistory.filter((entry: any) => {
      const details = (entry.details || "").toLowerCase();
      return details.includes(searchLower);
    });
  }, [shortlistHistory, historySearchTerm]);

  // Filter candidates based on search term
  const filteredCandidates = useMemo(() => {
    if (!searchTerm.trim()) {
      return candidates;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return candidates.filter((candidate) => {
      const nameMatch = candidate.full_name?.toLowerCase().includes(searchLower);
      const emailMatch = candidate.email?.toLowerCase().includes(searchLower);
      const phoneMatch = candidate.phone?.toLowerCase().includes(searchLower);
      const jobMatch = candidate.jobs?.job_title?.toLowerCase().includes(searchLower);
      return nameMatch || emailMatch || phoneMatch || jobMatch;
    });
  }, [candidates, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500 px-2 sm:px-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Shortlisting Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Manage candidate status and shortlist candidates for interviews
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "shortlist" | "history")}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="shortlist" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Search className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Shortlist</span>
            <span className="sm:hidden">List</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <History className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">History</span>
            <span className="sm:hidden">Hist</span>
            <span className="ml-1">({shortlistHistory.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shortlist" className="space-y-4 sm:space-y-6 mt-4 sm:mt-6">
      {/* Search Bar */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
          Search Candidate
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name, email, phone, or job title"
            className="pl-9 text-sm sm:text-base"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4">
        {filteredCandidates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{searchTerm ? "No candidates found matching your search." : "No candidates found. Upload resumes to see candidates here."}</p>
          </div>
        ) : (
          filteredCandidates.map((candidate) => (
            <CandidateCard
              variant="row"
              key={candidate.id}
              id={candidate.id}
              fullName={candidate.full_name}
              email={candidate.email}
              phone={candidate.phone}
              resumeUrl={candidate.resume_url}
              appliedJob={candidate.jobs?.job_title || null}
              status={candidate.status}
              onViewResume={() =>
                candidate.resume_url && handleViewResume(candidate.resume_url)
              }
            >
              <Select
                value={candidate.status || "Pending"}
                onValueChange={(value) => handleStatusChange(candidate.id, value)}
                disabled={updatingStatus === candidate.id}
              >
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Shortlisted">Shortlisted</SelectItem>
                  <SelectItem value="Interview Scheduled">Interview Scheduled</SelectItem>
                </SelectContent>
              </Select>
              {updatingStatus === candidate.id && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <Input
                className="h-8 w-[180px]"
                placeholder="Comment"
                value={commentDrafts[candidate.id] ?? ""}
                onChange={(e) => handleCommentChange(candidate.id, e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => void handleSendShortlistEmail(candidate)}
                disabled={sendingEmailId === candidate.id || sendShortlistEmailMutation.isPending}
              >
                {sendingEmailId === candidate.id || sendShortlistEmailMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Mail
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8"
                disabled={savingCommentId === candidate.id}
                onClick={() => handleSaveComment(candidate.id)}
              >
                {savingCommentId === candidate.id ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </CandidateCard>
          ))
        )}
      </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4 sm:space-y-6 mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Shortlist mail history</p>
              <p className="text-xs text-muted-foreground">
                Track when shortlist emails were sent to candidates.
              </p>
            </div>
            <div className="w-full sm:w-80">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={historySearchTerm}
                  onChange={(event) => setHistorySearchTerm(event.target.value)}
                  placeholder="Search by candidate name or email"
                  className="pl-9 text-sm"
                />
              </div>
            </div>
          </div>

          <Card className="shadow-sm border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Shortlist Emails ({shortlistHistory.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isShortlistHistoryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : filteredShortlistHistory.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  No shortlist emails have been sent yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Type</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right w-[180px]">Sent At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredShortlistHistory.map((entry: any) => (
                        <TableRow key={entry.id} className="hover:bg-accent/40">
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              Shortlist Email
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.details}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground text-right">
                            {new Date(entry.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shortlist Mail History</DialogTitle>
            <DialogDescription>
              {historyCandidate
                ? `All shortlist emails sent to ${historyCandidate.full_name} (${historyCandidate.email}).`
                : "Shortlist email history."}
            </DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : historyEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No shortlist emails have been sent yet for this candidate.
            </p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {historyEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{entry.details}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Email Replies Dialog */}
      <Dialog open={repliesDialogOpen} onOpenChange={setRepliesDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Replies from {selectedCandidateForReplies?.full_name || "Candidate"}</DialogTitle>
            <DialogDescription>
              {selectedCandidateForReplies
                ? `Email replies received from ${selectedCandidateForReplies.full_name} (${selectedCandidateForReplies.email}) for shortlist stage.`
                : "Email replies."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedCandidateForReplies && getCandidateReplies(selectedCandidateForReplies).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No email replies received yet from this candidate.</p>
              </div>
            ) : (
              selectedCandidateForReplies &&
              getCandidateReplies(selectedCandidateForReplies).map((reply) => (
                <div key={reply.id} className="border rounded-lg p-4 space-y-3 bg-card">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{reply.subject || "No Subject"}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Received: {new Date(reply.received_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={reply.status === "unread" ? "default" : "secondary"} className="text-xs">
                      {reply.status}
                    </Badge>
                  </div>
                  <div className="text-sm whitespace-pre-wrap border-t pt-3 text-muted-foreground bg-muted/30 p-3 rounded">
                    {reply.reply_content.length > 500
                      ? reply.reply_content.substring(0, 500) + "..."
                      : reply.reply_content}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


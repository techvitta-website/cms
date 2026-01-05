import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CandidateCard from "@/components/CandidateCard";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Edit, Trash2, Mail, Search, History, MessageSquare } from "lucide-react";
import { openResume } from "@/lib/resume";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  feedback_rating?: number | null;
  feedback_notes?: string | null;
  feedback_decision?: "Approve" | "Reject" | null;
  feedback_submitted_at?: string | null;
  jobs?: {
    job_title: string;
  } | null;
}

interface FeedbackFormData {
  candidateId: string;
  candidateEmail?: string;
  candidateName?: string;
  positionTitle?: string | null;
  panelFeedback: string;
  finalDecision: "Approve" | "Reject";
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

export default function Feedback() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingCandidateId, setDeletingCandidateId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sendingDocumentsEmail, setSendingDocumentsEmail] = useState<string | null>(null);
  const [formData, setFormData] = useState<FeedbackFormData>({
    candidateId: "",
    candidateEmail: "",
    candidateName: "",
    positionTitle: null,
    panelFeedback: "",
    finalDecision: "Approve",
  });
  const [editFormData, setEditFormData] = useState<FeedbackFormData>({
    candidateId: "",
    panelFeedback: "",
    finalDecision: "Approve",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [repliesDialogOpen, setRepliesDialogOpen] = useState(false);
  const [selectedCandidateForReplies, setSelectedCandidateForReplies] = useState<Candidate | null>(null);

  // Fetch candidates who have interview scheduled
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["interviewed-candidates"],
    queryFn: async () => {
      // Show candidates with "Interview Scheduled" status - these need feedback
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
          feedback_rating,
          feedback_notes,
          feedback_decision,
          feedback_submitted_at,
          jobs (
            job_title
          )
        `)
        .eq("status", "Interview Scheduled")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data || []) as unknown) as Candidate[];
    },
  });

  // Fetch all candidates who have submitted feedback
  const { data: feedbackHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["feedback-history"],
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
          feedback_rating,
          feedback_notes,
          feedback_decision,
          feedback_submitted_at,
          jobs (
            job_title
          )
        `)
        .not("feedback_submitted_at", "is", null)
        .order("feedback_submitted_at", { ascending: false });

      if (error) throw error;
      return ((data || []) as unknown) as Candidate[];
    },
  });


  // Submit feedback mutation
  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: FeedbackFormData) => {
      // Update candidate status
      const newStatus = data.finalDecision === "Approve" ? "Approved" : "Rejected";
      const { error: updateError } = await supabase
        .from("candidates")
        .update({
          status: newStatus,
          feedback_rating: null,
          feedback_notes: data.panelFeedback.trim(),
          feedback_decision: data.finalDecision,
          feedback_submitted_at: new Date().toISOString(),
        })
        .eq("id", data.candidateId);

      if (updateError) throw updateError;

      // Log feedback activity
      const details = `Feedback: ${data.panelFeedback}. Decision: ${data.finalDecision}`;
      const { error: logError } = await supabase.from("activity_logs").insert({
        action: "FEEDBACK_SUBMITTED",
        details,
      });

      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviewed-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["shortlist-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["approved-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-history"] });
      toast({
        title: "Feedback Submitted",
        description: "Feedback has been submitted and candidate status updated.",
      });
      setIsDialogOpen(false);
      setFormData({
        candidateId: "",
        panelFeedback: "",
        finalDecision: "Approve",
      });
      setSelectedCandidate(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit feedback",
        variant: "destructive",
      });
    },
  });

  // Send documents email mutation
  const sendDocumentsEmailMutation = useMutation({
    mutationFn: async (candidate: Candidate) => {
      // Prevent duplicate documents emails
      const { data: existingLogs, error: historyError } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("action", "DOCUMENTS_EMAIL_SENT")
        .ilike("details", `%${candidate.email}%`)
        .limit(1);

      if (!historyError && existingLogs && existingLogs.length > 0) {
        throw new Error("Documents email has already been sent to this candidate.");
      }

      // Call edge function to send documents email
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: candidate.email,
          candidateName: candidate.full_name,
          emailType: "documents",
          data: {
            companyName: "Techvitta Innovations Pvt Ltd",
            positionTitle: candidate.jobs?.job_title || "the role",
            requiredDocuments: [
              "ID Proof (Aadhar/PAN/Passport)",
              "Educational Certificates",
              "Previous Employment Documents",
              "Passport Size Photographs",
              "Updated Resume",
            ],
          },
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to send email");
      }
    },
    onSuccess: (_, candidate) => {
      // Log documents email activity
      void supabase.from("activity_logs").insert({
        action: "DOCUMENTS_EMAIL_SENT",
        details: `Documents email sent to ${candidate.full_name} (${candidate.email})`,
      });
      toast({
        title: "Email Sent",
        description: `Documents request email has been sent to ${candidate.email}`,
      });
      setSendingDocumentsEmail(null);
    },
    onError: (error: any) => {
      toast({
        title:
          error?.message === "Documents email has already been sent to this candidate."
            ? "Already sent"
            : "Error",
        description: error.message || "Failed to send email",
        variant:
          error?.message === "Documents email has already been sent to this candidate."
            ? "default"
            : "destructive",
      });
      setSendingDocumentsEmail(null);
    },
  });

  // Send rejection email mutation
  const sendRejectionEmailMutation = useMutation({
    mutationFn: async ({ candidate, feedbackNotes }: { candidate: Candidate; feedbackNotes: string }) => {
      // Prevent duplicate rejection emails
      const { data: existingLogs, error: historyError } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("action", "REJECTION_EMAIL_SENT")
        .ilike("details", `%${candidate.email}%`)
        .limit(1);

      if (!historyError && existingLogs && existingLogs.length > 0) {
        throw new Error("Rejection email has already been sent to this candidate.");
      }

      // Call edge function to send rejection email
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: candidate.email,
          candidateName: candidate.full_name,
          emailType: "reject",
          data: {
            companyName: "Techvitta Innovations Pvt Ltd",
            positionTitle: candidate.jobs?.job_title || "the role",
            feedbackNotes: feedbackNotes || undefined,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to send email");
      }
    },
    onSuccess: (_, { candidate }) => {
      // Log rejection email activity
      void supabase.from("activity_logs").insert({
        action: "REJECTION_EMAIL_SENT",
        details: `Rejection email sent to ${candidate.full_name} (${candidate.email})`,
      });
      toast({
        title: "Email Sent",
        description: `Rejection email has been sent to ${candidate.email}`,
      });
      setSendingDocumentsEmail(null);
    },
    onError: (error: any) => {
      toast({
        title:
          error?.message === "Rejection email has already been sent to this candidate."
            ? "Already sent"
            : "Error",
        description: error.message || "Failed to send email",
        variant:
          error?.message === "Rejection email has already been sent to this candidate."
            ? "default"
            : "destructive",
      });
      setSendingDocumentsEmail(null);
    },
  });

  const handleSendEmail = (candidate: Candidate) => {
    if (!selectedCandidate) return;
    
    setSendingDocumentsEmail(candidate.id);
    
    // If Reject is selected, send rejection email, otherwise send documents email
    if (formData.finalDecision === "Reject") {
      sendRejectionEmailMutation.mutate({
        candidate,
        feedbackNotes: formData.panelFeedback,
      });
    } else {
    sendDocumentsEmailMutation.mutate(candidate);
    }
  };

  const handleOpenDialog = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setFormData({
      candidateId: candidate.id,
      panelFeedback: candidate.feedback_notes || "",
      finalDecision: candidate.feedback_decision || "Approve",
    });
    setIsDialogOpen(true);
  };

  // Fetch email replies for feedback stage
  const { data: emailReplies = [] } = useQuery({
    queryKey: ["email-replies-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_replies")
        .select("*")
        .eq("email_stage", "feedback")
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

  // Update feedback mutation
  const updateFeedbackMutation = useMutation({
    mutationFn: async (data: FeedbackFormData) => {
      // Update candidate status based on decision
      const newStatus = data.finalDecision === "Approve" ? "Approved" : "Rejected";
      const { error: updateError } = await supabase
        .from("candidates")
        .update({
          status: newStatus,
          feedback_notes: data.panelFeedback.trim(),
          feedback_decision: data.finalDecision,
          feedback_submitted_at: new Date().toISOString(),
        })
        .eq("id", data.candidateId);

      if (updateError) throw updateError;

      // Log feedback update activity
      const details = `Feedback updated: ${data.panelFeedback}. Decision: ${data.finalDecision}`;
      const { error: logError } = await supabase.from("activity_logs").insert({
        action: "FEEDBACK_UPDATED",
        details,
      });

      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviewed-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["shortlist-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["approved-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-history"] });
      toast({
        title: "Feedback Updated",
        description: "Feedback has been updated successfully.",
      });
      setIsEditDialogOpen(false);
      setEditFormData({
        candidateId: "",
        panelFeedback: "",
        finalDecision: "Approve",
      });
      setEditingCandidate(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update feedback",
        variant: "destructive",
      });
    },
  });

  const handleOpenEditDialog = (candidate: Candidate) => {
    setEditingCandidate(candidate);
    setEditFormData({
      candidateId: candidate.id,
      panelFeedback: candidate.feedback_notes || "",
      finalDecision: candidate.feedback_decision || "Approve",
    });
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFormData.panelFeedback.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide panel feedback",
        variant: "destructive",
      });
      return;
    }
    updateFeedbackMutation.mutate(editFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.panelFeedback.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide panel feedback",
        variant: "destructive",
      });
      return;
    }
    submitFeedbackMutation.mutate(formData);
  };

  const handleViewResume = async (resumeUrl: string) => {
    await openResume(resumeUrl);
  };

  // Delete feedback mutation
  const deleteFeedbackMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      // Clear feedback fields but keep the status as is
      const { error: updateError } = await supabase
        .from("candidates")
        .update({
          feedback_notes: null,
          feedback_decision: null,
          feedback_submitted_at: null,
        } as any)
        .eq("id", candidateId);

      if (updateError) throw updateError;

      // Log feedback deletion activity
      const { error: logError } = await supabase.from("activity_logs").insert({
        action: "FEEDBACK_DELETED",
        details: `Feedback deleted for candidate ${candidateId}`,
      });

      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviewed-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["shortlist-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["approved-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-history"] });
      toast({
        title: "Feedback Deleted",
        description: "Feedback has been deleted successfully.",
      });
      setIsDeleteDialogOpen(false);
      setDeletingCandidateId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete feedback",
        variant: "destructive",
      });
      setDeletingCandidateId(null);
    },
  });

  const handleDeleteFeedback = (candidateId: string) => {
    setDeletingCandidateId(candidateId);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingCandidateId) {
      deleteFeedbackMutation.mutate(deletingCandidateId);
    }
  };

  // Filter candidates based on search term (for pending feedback)
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

  // Filter feedback history based on search term
  const filteredFeedbackHistory = useMemo(() => {
    if (!historySearchTerm.trim()) {
      return feedbackHistory;
    }
    
    const searchLower = historySearchTerm.toLowerCase();
    return feedbackHistory.filter((candidate) => {
      const nameMatch = candidate.full_name?.toLowerCase().includes(searchLower);
      const emailMatch = candidate.email?.toLowerCase().includes(searchLower);
      const phoneMatch = candidate.phone?.toLowerCase().includes(searchLower);
      const jobMatch = candidate.jobs?.job_title?.toLowerCase().includes(searchLower);
      const feedbackMatch = candidate.feedback_notes?.toLowerCase().includes(searchLower);
      return nameMatch || emailMatch || phoneMatch || jobMatch || feedbackMatch;
    });
  }, [feedbackHistory, historySearchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Interview Feedback</h1>
        <p className="text-muted-foreground mt-1">
          Submit and manage feedback for candidates who have completed their interviews
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Pending Feedback
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History ({feedbackHistory.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-6 mt-6">
      {/* Candidates who need feedback */}
      <section className="space-y-4">
        
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
              className="pl-9"
            />
          </div>
        </div>

        {filteredCandidates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
            <p>{searchTerm ? "No candidates found matching your search." : "No candidates with scheduled interviews found. Schedule interviews first to submit feedback."}</p>
          </div>
        ) : (          <div className="grid gap-6">
            {filteredCandidates.map((candidate) => (
              <CandidateCard
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
                <div className="flex gap-2 flex-wrap">
                </div>
                <Dialog
                  open={isDialogOpen && selectedCandidate?.id === candidate.id}
                  onOpenChange={setIsDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenDialog(candidate)}>
                      Submit Feedback
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Submit Interview Feedback</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                      <div>
                        <Label>Candidate Name</Label>
                        <Input
                          value={candidate.full_name}
                          disabled
                          className="bg-muted"
                        />
                      </div>

                      <div>
                        <Label>Panel Feedback</Label>
                        <Textarea
                          value={formData.panelFeedback}
                          onChange={(e) =>
                            setFormData({ ...formData, panelFeedback: e.target.value })
                          }
                          placeholder="Enter detailed feedback from the interview panel"
                          rows={6}
                          required
                        />
                      </div>

                      <div>
                        <Label>Final Decision</Label>
                        <Select
                          value={formData.finalDecision}
                          onValueChange={(value: "Approve" | "Reject") =>
                            setFormData({ ...formData, finalDecision: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Approve">Approve</SelectItem>
                            <SelectItem value="Reject">Reject</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        {formData.finalDecision === "Reject" && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              if (selectedCandidate) {
                                handleSendEmail(selectedCandidate);
                              }
                            }}
                            disabled={
                              !selectedCandidate ||
                              sendingDocumentsEmail === selectedCandidate.id ||
                              sendDocumentsEmailMutation.isPending ||
                              sendRejectionEmailMutation.isPending
                            }
                          >
                            {sendingDocumentsEmail === selectedCandidate?.id ||
                            sendDocumentsEmailMutation.isPending ||
                            sendRejectionEmailMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Mail className="mr-2 h-4 w-4" />
                                Send Rejection Mail
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={submitFeedbackMutation.isPending}
                        >
                          {submitFeedbackMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            "Submit Feedback"
                          )}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CandidateCard>
            ))}
          </div>
        )}
      </section>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
      {/* Feedback History - All submitted feedback */}
      <section className="space-y-4">

        {/* Search Bar for History */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
            Search Feedback History
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={historySearchTerm}
              onChange={(event) => setHistorySearchTerm(event.target.value)}
              placeholder="Search by name, email, phone, job title, or feedback notes"
              className="pl-9"
            />
        </div>
        </div>

        {isHistoryLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFeedbackHistory.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
            <p>{historySearchTerm ? "No feedback found matching your search." : "No feedback submitted yet. Submit feedback to see history here."}</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredFeedbackHistory.map((candidate) => (
              <div
                key={candidate.id}
                className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex flex-wrap gap-6 items-start">
                  {/* Candidate Details - Horizontal Layout */}
                  <div className="flex-shrink-0 min-w-[200px]">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Candidate Name</p>
                    <p className="text-sm font-semibold text-foreground">{candidate.full_name}</p>
                  </div>
                  
                  <div className="flex-shrink-0 min-w-[200px]">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Email</p>
                    <p className="text-sm text-foreground break-all">{candidate.email}</p>
                  </div>
                  
                  <div className="flex-shrink-0 min-w-[150px]">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Phone</p>
                    <p className="text-sm text-foreground">{candidate.phone || "—"}</p>
                  </div>
                  
                  <div className="flex-shrink-0 min-w-[150px]">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Job Applied</p>
                    <p className="text-sm text-foreground">
                      {candidate.jobs?.job_title || "—"}
                    </p>
                  </div>
                  
                  <div className="flex-shrink-0 min-w-[120px]">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Current Status</p>
                    <p className="text-sm text-foreground">{candidate.status}</p>
                  </div>
                  
                  <div className="flex-shrink-0 min-w-[150px]">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Feedback Submitted</p>
                    <p className="text-sm text-foreground">
                      {candidate.feedback_submitted_at
                        ? new Date(candidate.feedback_submitted_at).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  
                  <div className="flex-shrink-0 min-w-[120px]">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Final Decision</p>
                    <p
                      className={`text-sm font-semibold ${
                        candidate.feedback_decision === "Approve"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {candidate.feedback_decision || "—"}
                    </p>
                  </div>
                  
                  {candidate.feedback_notes && (
                    <div className="flex-shrink-0 min-w-[250px] max-w-[400px]">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Panel Feedback</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 p-2 rounded-md line-clamp-3">
                        {candidate.feedback_notes}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex-shrink-0 flex gap-2">
                    {candidate.resume_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewResume(candidate.resume_url!)}
                        className="mt-5"
                      >
                        View Resume
                      </Button>
                    )}
                    <Dialog
                      open={isEditDialogOpen && editingCandidate?.id === candidate.id}
                      onOpenChange={setIsEditDialogOpen}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditDialog(candidate)}
                          className="mt-5"
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Edit Interview Feedback</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
                          <div>
                            <Label>Candidate Name</Label>
                            <Input
                              value={candidate.full_name}
                              disabled
                              className="bg-muted"
                            />
                          </div>

                          <div>
                            <Label>Panel Feedback</Label>
                            <Textarea
                              value={editFormData.panelFeedback}
                              onChange={(e) =>
                                setEditFormData({ ...editFormData, panelFeedback: e.target.value })
                              }
                              placeholder="Enter detailed feedback from the interview panel"
                              rows={6}
                              required
                            />
                          </div>

                          <div>
                            <Label>Final Decision</Label>
                            <Select
                              value={editFormData.finalDecision}
                              onValueChange={(value: "Approve" | "Reject") =>
                                setEditFormData({ ...editFormData, finalDecision: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Approve">Approve</SelectItem>
                                <SelectItem value="Reject">Reject</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex justify-end gap-2 pt-4">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setIsEditDialogOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              disabled={updateFeedbackMutation.isPending}
                            >
                              {updateFeedbackMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Updating...
                                </>
                              ) : (
                                "Update Feedback"
                              )}
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteFeedback(candidate.id)}
                      className="mt-5 text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={deleteFeedbackMutation.isPending && deletingCandidateId === candidate.id}
                    >
                      {deleteFeedbackMutation.isPending && deletingCandidateId === candidate.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
        </TabsContent>

      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Feedback</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this feedback? This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingCandidateId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteFeedbackMutation.isPending}
            >
              {deleteFeedbackMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Replies Dialog */}
      <Dialog open={repliesDialogOpen} onOpenChange={setRepliesDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Replies from {selectedCandidateForReplies?.full_name || "Candidate"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedCandidateForReplies && getCandidateReplies(selectedCandidateForReplies).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No email replies received yet from this candidate for feedback/documents stage.</p>
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



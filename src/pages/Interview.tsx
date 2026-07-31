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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Clock, Loader2, Mail, Search, History, ExternalLink, Video } from "lucide-react";
import { format, addDays, addMinutes, isWeekend, setHours, setMinutes, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { openResume } from "@/lib/resume";
import CandidateFilterBar, {
  filterAndSortCandidates,
  jobOptionsFrom,
  type CandidateSort,
} from "@/components/CandidateFilterBar";
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

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  status: string;
  job_id: string | null;
  created_at?: string | null;
  jobs?: {
    job_title: string;
  } | null;
}

interface InterviewFormData {
  candidateId: string;
  candidateName: string;
  interviewMode: "Online" | "Offline";
  interviewDate: Date | null;
  interviewTime: string;
  interviewPanel: string;
  interviewPanelLink: string;
  notes: string;
  locationDetails: string;
  reportingInstructions: string;
  documentsToBring: string;
  panelRoomDetails: string;
}

// --- Quick (auto) interview scheduling -------------------------------------
// One-click scheduling: pick the next open weekday slot, pre-fill a default
// panel and the company meeting link (remembered per browser), then book the
// interview and email the invite in a single confirm.
const QUICK_LINK_KEY = "cms_quick_interview_link";
const QUICK_PANEL_KEY = "cms_quick_interview_panel";
const FALLBACK_PANEL = "TechVitta Interview Panel";
const BUSINESS_END_HOUR = 17; // slots run up to (not including) 17:00
const DEFAULT_START_HOUR = 11; // preferred first slot each day
const SLOT_MINUTES = 30;

function nextBusinessDay(from: Date): Date {
  let d = addDays(startOfDay(from), 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

function slotKey(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

// Next open weekday 30-min slot (11:00–16:30) that isn't already booked.
function computeQuickSlot(taken: Set<string>, now: Date): Date {
  let slot = setMinutes(setHours(nextBusinessDay(now), DEFAULT_START_HOUR), 0);
  for (let i = 0; i < 600; i++) {
    if (!isWeekend(slot) && slot.getHours() < BUSINESS_END_HOUR && !taken.has(slotKey(slot))) {
      return slot;
    }
    slot = addMinutes(slot, SLOT_MINUTES);
    if (slot.getHours() >= BUSINESS_END_HOUR || isWeekend(slot)) {
      slot = setMinutes(setHours(nextBusinessDay(slot), DEFAULT_START_HOUR), 0);
    }
  }
  return slot;
}

interface QuickForm {
  date: Date;
  time: string;
  panel: string;
  link: string;
}

export default function Interview() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<InterviewFormData>({
    candidateId: "",
    candidateName: "",
    interviewMode: "Online",
    interviewDate: null,
    interviewTime: "",
    interviewPanel: "",
    interviewPanelLink: "",
    notes: "",
    locationDetails: "",
    reportingInstructions: "",
    documentsToBring: "",
    panelRoomDetails: "",
  });
  const [sendingEmailFromForm, setSendingEmailFromForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("schedule");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [jobFilter, setJobFilter] = useState("all");
  const [sort, setSort] = useState<CandidateSort>("date-desc");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickCandidate, setQuickCandidate] = useState<Candidate | null>(null);
  const [quickForm, setQuickForm] = useState<QuickForm | null>(null);
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);

  // Fetch only candidates whose interview is scheduled (clean stage split — a
  // shortlisted candidate lives on the Shortlist page until they are advanced
  // here, at which point they leave Shortlist and appear only on this page).
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["shortlisted-candidates"],
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
          created_at,
          jobs (
            job_title
          )
        `)
        .in("status", ["Interview Pending", "Interview Scheduled"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Candidate[];
    },
  });

  // Schedule interview mutation
  const scheduleInterviewMutation = useMutation({
    mutationFn: async (data: InterviewFormData) => {
      if (!data.interviewDate) {
        throw new Error("Interview date is required");
      }

      const interviewDateTime = new Date(data.interviewDate);
      const [hours, minutes] = data.interviewTime.split(":").map(Number);
      interviewDateTime.setHours(hours, minutes);

      if (!data.candidateId) {
        throw new Error("Missing candidate information");
      }

      // Combine all additional details into notes field since table doesn't have separate columns
      let combinedNotes = data.notes || "";
      if (data.interviewMode === "Online" && data.interviewPanelLink) {
        combinedNotes += (combinedNotes ? "\n\n" : "") + `Meeting Link: ${data.interviewPanelLink}`;
      }
      if (data.interviewMode === "Offline") {
        if (data.locationDetails) {
          combinedNotes += (combinedNotes ? "\n\n" : "") + `Location: ${data.locationDetails}`;
        }
        if (data.panelRoomDetails) {
          combinedNotes += (combinedNotes ? "\n\n" : "") + `Room Details: ${data.panelRoomDetails}`;
        }
        if (data.reportingInstructions) {
          combinedNotes += (combinedNotes ? "\n\n" : "") + `Reporting Instructions: ${data.reportingInstructions}`;
        }
        if (data.documentsToBring) {
          combinedNotes += (combinedNotes ? "\n\n" : "") + `Documents to Bring: ${data.documentsToBring}`;
        }
      }

      const interviewRecord = {
        candidate_id: data.candidateId,
        candidate_name: data.candidateName,
        interview_mode: data.interviewMode,
        interview_date: interviewDateTime.toISOString(),
        interview_panel: data.interviewPanel,
        notes: combinedNotes || null,
      };

      const { error: insertError } = await supabase.from("interviews").insert(interviewRecord);
      
      if (insertError) {
        console.error("Error inserting interview:", insertError);
        throw insertError;
      }

      await supabase
        .from("candidates")
        .update({
          status: "Interview Scheduled",
        })
        .eq("id", data.candidateId);

      await supabase
        .from("shortlist_records")
        .update({ status: "Interview Scheduled" })
        .eq("candidate_id", data.candidateId);

      const details = `Interview scheduled: ${data.interviewMode} mode with panel ${data.interviewPanel} on ${format(interviewDateTime, "PPP 'at' p")}. Notes: ${data.notes || "None"}`;

      const { error } = await supabase.from("activity_logs").insert({
        action: "INTERVIEW_SCHEDULED",
        details,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shortlisted-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["interview-history"] });
      toast({
        title: "Interview Scheduled",
        description: "Interview has been scheduled successfully.",
      });
      setIsDialogOpen(false);
      setFormData({
        candidateId: "",
        candidateName: "",
        interviewMode: "Online",
        interviewDate: null,
        interviewTime: "",
        interviewPanel: "",
        interviewPanelLink: "",
        notes: "",
        locationDetails: "",
        reportingInstructions: "",
        documentsToBring: "",
        panelRoomDetails: "",
      });
      setSelectedCandidate(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule interview",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setFormData({
      candidateId: candidate.id,
      candidateName: candidate.full_name,
      interviewMode: "Online",
      interviewDate: null,
      interviewTime: "",
      interviewPanel: "",
      interviewPanelLink: "",
      notes: "",
      locationDetails: "",
      reportingInstructions: "",
      documentsToBring: "",
      panelRoomDetails: "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.interviewDate || !formData.interviewTime) {
      toast({
        title: "Validation Error",
        description: "Please select both date and time for the interview",
        variant: "destructive",
      });
      return;
    }
    scheduleInterviewMutation.mutate(formData);
  };

  const handleViewResume = async (resumeUrl: string) => {
    await openResume(resumeUrl);
  };

  // Send email from form data only (without scheduling)
  const sendEmailFromFormMutation = useMutation({
    mutationFn: async ({ formData, candidate }: { formData: InterviewFormData; candidate: Candidate }) => {
      if (!formData.interviewDate || !formData.interviewTime) {
        throw new Error("Please select both date and time for the interview");
      }

      const interviewDateTime = new Date(formData.interviewDate);
      const [hours, minutes] = formData.interviewTime.split(":").map(Number);
      interviewDateTime.setHours(hours, minutes);

      // Prevent sending duplicate interview emails
      const { data: existingLogs, error: historyError } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("action", "INTERVIEW_EMAIL_SENT")
        .ilike("details", `%${candidate.email}%`)
        .limit(1);

      if (!historyError && existingLogs && existingLogs.length > 0) {
        throw new Error("Interview email has already been sent to this candidate.");
      }

      // Send email using form data
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: candidate.email,
          candidateName: candidate.full_name,
          emailType: "interview",
          data: {
            companyName: "Techvitta Innovations Pvt Ltd",
            positionTitle: candidate.jobs?.job_title || "Interview Opportunity",
            interviewDate: format(interviewDateTime, "yyyy-MM-dd"),
            interviewTime: format(interviewDateTime, "HH:mm"),
            interviewMode: formData.interviewMode || "Online",
            interviewPanel: formData.interviewPanel || "",
            interviewPanelLink: formData.interviewPanelLink || "",
            interviewNotes: formData.notes || "",
            locationDetails: formData.locationDetails || "",
            reportingInstructions: formData.reportingInstructions || "",
            documentsToBring: formData.documentsToBring || "",
            panelRoomDetails: formData.panelRoomDetails || "",
          },
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to send email");
      }

      // Log interview email activity
      const { error: logError } = await supabase.from("activity_logs").insert({
        action: "INTERVIEW_EMAIL_SENT",
        details: `Interview email sent to ${candidate.full_name} (${candidate.email})`,
      });
      if (logError) {
        console.error("Failed to log interview email activity:", logError);
      }
    },
    onSuccess: () => {
      toast({
        title: "Email Sent",
        description: `Interview email has been sent to ${selectedCandidate?.email}`,
      });
      setSendingEmailFromForm(false);
    },
    onError: (error: any) => {
      toast({
        title:
          error?.message === "Interview email has already been sent to this candidate."
            ? "Already sent"
            : "Error",
        description: error.message || "Failed to send email",
        variant:
          error?.message === "Interview email has already been sent to this candidate."
            ? "default"
            : "destructive",
      });
      setSendingEmailFromForm(false);
    },
  });

  const handleSendEmailFromForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.interviewDate || !formData.interviewTime || !formData.interviewPanel) {
      toast({
        title: "Validation Error",
        description: "Please fill all required fields (date, time, and panel) before sending email",
        variant: "destructive",
      });
      return;
    }
    if (!selectedCandidate) {
      toast({
        title: "Validation Error",
        description: "Candidate information is missing",
        variant: "destructive",
      });
      return;
    }
    setSendingEmailFromForm(true);
    sendEmailFromFormMutation.mutate({ formData, candidate: selectedCandidate });
  };

  // Check if form is valid for sending email
  const isFormValidForEmail = formData.interviewDate && formData.interviewTime && formData.interviewPanel;

  // Fetch interview history
  const { data: interviewHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["interview-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interviews")
        .select(`
          id,
          candidate_id,
          candidate_name,
          interview_mode,
          interview_date,
          interview_panel,
          notes,
          created_at,
          candidates (
            id,
            full_name,
            email,
            phone,
            jobs (
              job_title
            )
          )
        `)
        .order("interview_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Helper function to extract meeting link from notes
  const extractMeetingLink = (notes: string | null): string | null => {
    if (!notes) return null;
    // Try multiple patterns to extract the link
    // Pattern 1: "Meeting Link: http://..." or "Meeting Link: https://..."
    let linkMatch = notes.match(/Meeting Link:\s*(https?:\/\/[^\s\n]+)/i);
    if (linkMatch) return linkMatch[1];
    
    // Pattern 2: "Meeting Link: [any URL-like string]"
    linkMatch = notes.match(/Meeting Link:\s*([^\s\n]+)/i);
    if (linkMatch) {
      const link = linkMatch[1].trim();
      // If it doesn't start with http, add https://
      if (link && !link.startsWith('http://') && !link.startsWith('https://')) {
        return `https://${link}`;
      }
      return link;
    }
    
    // Pattern 3: Just look for any URL in the notes (fallback)
    linkMatch = notes.match(/(https?:\/\/[^\s\n]+)/i);
    if (linkMatch) return linkMatch[1];
    
    return null;
  };

  // Helper function to extract location details from notes
  const extractLocationDetails = (notes: string | null): { location?: string; room?: string } => {
    if (!notes) return {};
    const locationMatch = notes.match(/Location:\s*([^\n]+)/i);
    const roomMatch = notes.match(/Room Details:\s*([^\n]+)/i);
    return {
      location: locationMatch ? locationMatch[1].trim() : undefined,
      room: roomMatch ? roomMatch[1].trim() : undefined,
    };
  };

  // Filter interview history based on search term
  const filteredInterviewHistory = useMemo(() => {
    if (!historySearchTerm.trim()) {
      return interviewHistory;
    }
    
    const searchLower = historySearchTerm.toLowerCase();
    return interviewHistory.filter((interview: any) => {
      const nameMatch = (interview.candidates?.full_name || interview.candidate_name || "").toLowerCase().includes(searchLower);
      const emailMatch = (interview.candidates?.email || "").toLowerCase().includes(searchLower);
      const jobMatch = (interview.candidates?.jobs?.job_title || "").toLowerCase().includes(searchLower);
      const panelMatch = (interview.interview_panel || "").toLowerCase().includes(searchLower);
      const modeMatch = (interview.interview_mode || "").toLowerCase().includes(searchLower);
      const meetingLink = extractMeetingLink(interview.notes);
      const linkMatch = meetingLink?.toLowerCase().includes(searchLower);
      return nameMatch || emailMatch || jobMatch || panelMatch || modeMatch || linkMatch;
    });
  }, [interviewHistory, historySearchTerm]);

  // Job options for the filter dropdown, derived from the loaded candidates.
  const jobOptions = useMemo(() => jobOptionsFrom(candidates), [candidates]);

  // Filter + sort candidates (search term, job filter, chosen sort order).
  const filteredCandidates = useMemo(
    () =>
      filterAndSortCandidates(candidates, {
        searchTerm,
        jobFilter,
        sort,
      }),
    [candidates, searchTerm, jobFilter, sort],
  );

  // Slots already booked (future interviews) so quick-schedule doesn't collide.
  const takenSlots = useMemo(() => {
    const s = new Set<string>();
    (interviewHistory as any[]).forEach((iv) => {
      if (iv.interview_date) s.add(slotKey(new Date(iv.interview_date)));
    });
    return s;
  }, [interviewHistory]);

  // Latest booked interview datetime per candidate — used to show whether an
  // interview has actually been booked (vs just sitting in the interview stage).
  const bookedByCandidate = useMemo(() => {
    const m = new Map<string, string>();
    (interviewHistory as any[]).forEach((iv) => {
      if (iv.candidate_id && iv.interview_date) {
        const prev = m.get(iv.candidate_id);
        if (!prev || new Date(iv.interview_date) > new Date(prev)) {
          m.set(iv.candidate_id, iv.interview_date);
        }
      }
    });
    return m;
  }, [interviewHistory]);

  // Move a candidate to a different pipeline stage from the Interview tab.
  // Mainly used to send someone back to "Shortlisted" if the interview can't
  // happen — they then leave this tab and reappear on the Shortlist page.
  const updateStageMutation = useMutation({
    mutationFn: async ({ candidate, newStatus }: { candidate: Candidate; newStatus: string }) => {
      const { error } = await supabase
        .from("candidates")
        .update({ status: newStatus })
        .eq("id", candidate.id);
      if (error) throw error;

      await supabase
        .from("shortlist_records")
        .update({ status: newStatus })
        .eq("candidate_id", candidate.id);

      await supabase.from("activity_logs").insert({
        action: "STATUS_UPDATED",
        details: `${candidate.full_name} moved to ${newStatus} from the Interview stage`,
      });
    },
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["shortlisted-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["shortlist-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["interviewed-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });
      toast({
        title: "Stage updated",
        description:
          newStatus === "Interview Scheduled"
            ? "Candidate kept in the Interview stage."
            : `Candidate moved to ${newStatus}.`,
      });
      setUpdatingStageId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update stage",
        variant: "destructive",
      });
      setUpdatingStageId(null);
    },
  });

  const handleStageChange = (candidate: Candidate, newStatus: string) => {
    if (newStatus === candidate.status) return;
    setUpdatingStageId(candidate.id);
    updateStageMutation.mutate({ candidate, newStatus });
  };

  // Open the one-click quick-schedule dialog with an auto-picked slot and the
  // remembered default panel + company meeting link.
  const handleOpenQuick = (candidate: Candidate) => {
    const slot = computeQuickSlot(takenSlots, new Date());
    let savedLink = "";
    let savedPanel = FALLBACK_PANEL;
    try {
      savedLink = localStorage.getItem(QUICK_LINK_KEY) || "";
      savedPanel = localStorage.getItem(QUICK_PANEL_KEY) || FALLBACK_PANEL;
    } catch {
      // localStorage unavailable — fall back to defaults.
    }
    setQuickCandidate(candidate);
    setQuickForm({
      date: slot,
      time: format(slot, "HH:mm"),
      panel: savedPanel,
      link: savedLink,
    });
    setQuickOpen(true);
  };

  // Book the interview AND email the invite in one step.
  const quickScheduleMutation = useMutation({
    mutationFn: async ({
      candidate,
      date,
      time,
      panel,
      link,
    }: {
      candidate: Candidate;
      date: Date;
      time: string;
      panel: string;
      link: string;
    }) => {
      const interviewDateTime = new Date(date);
      const [hours, minutes] = time.split(":").map(Number);
      interviewDateTime.setHours(hours, minutes, 0, 0);

      // Don't double-send if this candidate was already invited.
      const { data: existingLogs } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("action", "INTERVIEW_EMAIL_SENT")
        .ilike("details", `%${candidate.email}%`)
        .limit(1);
      if (existingLogs && existingLogs.length > 0) {
        throw new Error("Interview email has already been sent to this candidate.");
      }

      const notes = link ? `Meeting Link: ${link}` : null;

      const { error: insertError } = await supabase.from("interviews").insert({
        candidate_id: candidate.id,
        candidate_name: candidate.full_name,
        interview_mode: "Online",
        interview_date: interviewDateTime.toISOString(),
        interview_panel: panel,
        notes,
      });
      if (insertError) throw insertError;

      await supabase
        .from("candidates")
        .update({ status: "Interview Scheduled" })
        .eq("id", candidate.id);
      await supabase
        .from("shortlist_records")
        .update({ status: "Interview Scheduled" })
        .eq("candidate_id", candidate.id);

      await supabase.from("activity_logs").insert({
        action: "INTERVIEW_SCHEDULED",
        details: `Interview auto-scheduled (Quick): Online with panel ${panel} on ${format(
          interviewDateTime,
          "PPP 'at' p",
        )}.`,
      });

      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: candidate.email,
          candidateName: candidate.full_name,
          emailType: "interview",
          data: {
            companyName: "Techvitta Innovations Pvt Ltd",
            positionTitle: candidate.jobs?.job_title || "Interview Opportunity",
            interviewDate: format(interviewDateTime, "yyyy-MM-dd"),
            interviewTime: format(interviewDateTime, "HH:mm"),
            interviewMode: "Online",
            interviewPanel: panel || "",
            interviewPanelLink: link || "",
            interviewNotes: "",
            locationDetails: "",
            reportingInstructions: "",
            documentsToBring: "",
            panelRoomDetails: "",
          },
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to send email");

      await supabase.from("activity_logs").insert({
        action: "INTERVIEW_EMAIL_SENT",
        details: `Interview email sent to ${candidate.full_name} (${candidate.email})`,
      });

      // Remember the panel + link as the defaults for next time.
      try {
        localStorage.setItem(QUICK_LINK_KEY, link || "");
        localStorage.setItem(QUICK_PANEL_KEY, panel || "");
      } catch {
        // ignore
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shortlisted-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["interview-history"] });
      toast({
        title: "Interview scheduled",
        description: "Slot booked and the invite was emailed to the candidate.",
      });
      setQuickOpen(false);
      setQuickCandidate(null);
    },
    onError: (error: any) => {
      const already = error?.message?.includes("already been sent");
      toast({
        title: already ? "Already scheduled" : "Error",
        description: error.message || "Failed to schedule the interview",
        variant: already ? "default" : "destructive",
      });
    },
  });

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
        <h1 className="text-3xl font-bold text-foreground">Interview Scheduling</h1>
        <p className="text-muted-foreground mt-1">
          Book a slot for each candidate, or use the stage dropdown to send them back to Shortlist if the interview can't happen
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="schedule" className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            Schedule Interview
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History ({interviewHistory.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-6 mt-6">
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
        <CandidateFilterBar
          jobOptions={jobOptions}
          jobFilter={jobFilter}
          onJobChange={setJobFilter}
          sort={sort}
          onSortChange={setSort}
        />
      </div>

      <div className="grid gap-3 sm:gap-4">
        {filteredCandidates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{searchTerm || jobFilter !== "all" ? "No candidates found matching your filters." : "No candidates in the interview stage yet. Advance shortlisted candidates from the Shortlist page, then book each one's slot here."}</p>
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
              <div className="flex gap-2 flex-wrap items-center">
                {(() => {
                  const booked = bookedByCandidate.get(candidate.id);
                  return booked ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                      Interview: {format(new Date(booked), "MMM dd, HH:mm")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-700 border-amber-300">
                      Not booked yet
                    </Badge>
                  );
                })()}
                <Select
                  value={candidate.status || "Interview Pending"}
                  onValueChange={(value) => handleStageChange(candidate, value)}
                  disabled={updatingStageId === candidate.id}
                >
                  <SelectTrigger className="h-9 w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Shortlisted">Shortlisted (send back)</SelectItem>
                    <SelectItem value="Interview Pending">Interview Pending</SelectItem>
                    <SelectItem value="Interview Scheduled">Interview Scheduled</SelectItem>
                  </SelectContent>
                </Select>
                {updatingStageId === candidate.id && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Button
                  variant="default"
                  className="bg-gradient-primary hover:opacity-90"
                  onClick={() => handleOpenQuick(candidate)}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  Quick Schedule
                </Button>
                <Dialog open={isDialogOpen && selectedCandidate?.id === candidate.id} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={() => handleOpenDialog(candidate)}>
                      Schedule Interview
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Schedule Interview</DialogTitle>
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
                      <Label>Interview Mode</Label>
                      <Select
                        value={formData.interviewMode}
                        onValueChange={(value: "Online" | "Offline") =>
                          setFormData({ ...formData, interviewMode: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Online">Online</SelectItem>
                          <SelectItem value="Offline">Offline</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Interview Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !formData.interviewDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.interviewDate ? (
                                format(formData.interviewDate, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={formData.interviewDate || undefined}
                              onSelect={(date) =>
                                setFormData({ ...formData, interviewDate: date || null })
                              }
                              disabled={(date) => date < new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div>
                        <Label>Interview Time</Label>
                        <div className="flex gap-2 items-center">
                          <div className="relative flex-1">
                            <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Select
                              value={formData.interviewTime ? formData.interviewTime.split(':')[0] : ""}
                              onValueChange={(hour) => {
                                const currentMinute = formData.interviewTime ? formData.interviewTime.split(':')[1] || "00" : "00";
                                setFormData({ ...formData, interviewTime: `${hour}:${currentMinute}` });
                              }}
                            >
                              <SelectTrigger className="pl-10">
                                <SelectValue placeholder="HH" />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 24 }, (_, i) => (
                                  <SelectItem key={i} value={String(i).padStart(2, '0')}>
                                    {String(i).padStart(2, '0')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <span className="text-lg font-semibold">:</span>
                          <Select
                            value={formData.interviewTime ? formData.interviewTime.split(':')[1] : ""}
                            onValueChange={(minute) => {
                              const currentHour = formData.interviewTime ? formData.interviewTime.split(':')[0] || "00" : "00";
                              setFormData({ ...formData, interviewTime: `${currentHour}:${minute}` });
                            }}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="MM" />
                            </SelectTrigger>
                            <SelectContent>
                              {['00', '15', '30', '45'].map((min) => (
                                <SelectItem key={min} value={min}>
                                  {min}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label>Interview Panel</Label>
                      <Input
                        value={formData.interviewPanel}
                        onChange={(e) =>
                          setFormData({ ...formData, interviewPanel: e.target.value })
                        }
                        placeholder="Enter panel members' names"
                        required
                      />
                    </div>

                    {formData.interviewMode === "Online" && (
                      <div>
                        <Label>Interview Panel Link</Label>
                        <Input
                          type="url"
                          value={formData.interviewPanelLink}
                          onChange={(e) =>
                            setFormData({ ...formData, interviewPanelLink: e.target.value })
                          }
                          placeholder="Enter interview meeting link (e.g., Zoom, Google Meet)"
                        />
                      </div>
                    )}

                    {formData.interviewMode === "Offline" && (
                      <>
                        <div>
                          <Label>Location Details</Label>
                          <Textarea
                            value={formData.locationDetails}
                            onChange={(e) =>
                              setFormData({ ...formData, locationDetails: e.target.value })
                            }
                            placeholder="Enter the interview location address and details"
                            rows={3}
                          />
                        </div>

                        <div>
                          <Label>Reporting Instructions</Label>
                          <Textarea
                            value={formData.reportingInstructions}
                            onChange={(e) =>
                              setFormData({ ...formData, reportingInstructions: e.target.value })
                            }
                            placeholder="Enter reporting time, contact person, and other instructions"
                            rows={3}
                          />
                        </div>

                        <div>
                          <Label>Documents to Bring</Label>
                          <Textarea
                            value={formData.documentsToBring}
                            onChange={(e) =>
                              setFormData({ ...formData, documentsToBring: e.target.value })
                            }
                            placeholder="List all required documents (e.g., ID proof, certificates, resume copies)"
                            rows={3}
                          />
                        </div>

                        <div>
                          <Label>Panel/Room Details</Label>
                          <Textarea
                            value={formData.panelRoomDetails}
                            onChange={(e) =>
                              setFormData({ ...formData, panelRoomDetails: e.target.value })
                            }
                            placeholder="Enter panel room number, floor, building details, etc."
                            rows={3}
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        placeholder="Additional notes about the interview"
                        rows={4}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDialogOpen(false)}
                        disabled={scheduleInterviewMutation.isPending || sendEmailFromFormMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSendEmailFromForm}
                        disabled={!isFormValidForEmail || scheduleInterviewMutation.isPending || sendEmailFromFormMutation.isPending}
                      >
                        {sendEmailFromFormMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending Mail...
                          </>
                        ) : (
                          <>
                            <Mail className="mr-2 h-4 w-4" />
                            Send Mail
                          </>
                        )}
                      </Button>
                      <Button
                        type="submit"
                        disabled={scheduleInterviewMutation.isPending || sendEmailFromFormMutation.isPending}
                      >
                        {scheduleInterviewMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Scheduling...
                          </>
                        ) : (
                          "Schedule Interview"
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            </CandidateCard>
          ))
        )}
      </div>

      {/* Quick Schedule confirm dialog — auto-picked slot + default link */}
      <Dialog open={quickOpen} onOpenChange={(o) => !quickScheduleMutation.isPending && setQuickOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick schedule — {quickCandidate?.full_name}</DialogTitle>
          </DialogHeader>
          {quickForm && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                Auto-picked the next open weekday slot. Adjust if needed, then confirm — the invite is
                emailed to {quickCandidate?.email}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !quickForm.date && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {quickForm.date ? format(quickForm.date, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={quickForm.date}
                        onSelect={(d) => d && setQuickForm((f) => (f ? { ...f, date: d } : f))}
                        disabled={(date) => date < startOfDay(new Date())}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label>Time</Label>
                  <Input
                    type="time"
                    value={quickForm.time}
                    onChange={(e) => setQuickForm((f) => (f ? { ...f, time: e.target.value } : f))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Interview panel</Label>
                <Input
                  value={quickForm.panel}
                  onChange={(e) => setQuickForm((f) => (f ? { ...f, panel: e.target.value } : f))}
                  placeholder="Panel member names"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Meeting link (default company link — remembered)</Label>
                <Input
                  value={quickForm.link}
                  onChange={(e) => setQuickForm((f) => (f ? { ...f, link: e.target.value } : f))}
                  placeholder="https://meet.google.com/your-room"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setQuickOpen(false)}
                  disabled={quickScheduleMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    quickCandidate &&
                    quickForm &&
                    quickScheduleMutation.mutate({
                      candidate: quickCandidate,
                      date: quickForm.date,
                      time: quickForm.time,
                      panel: quickForm.panel,
                      link: quickForm.link,
                    })
                  }
                  disabled={quickScheduleMutation.isPending || !quickForm.time}
                >
                  {quickScheduleMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scheduling…
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Confirm &amp; send
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
      {/* Interview History Section */}
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <History className="h-5 w-5" />
                Interview History
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Complete history of all scheduled interviews
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search Bar for History */}
          <div className="space-y-2 mb-6">
            <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
              Search History
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={historySearchTerm}
                onChange={(event) => setHistorySearchTerm(event.target.value)}
                placeholder="Search by name, email, job title, panel, mode, or meeting link"
                className="pl-9"
              />
            </div>
          </div>

          {isHistoryLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredInterviewHistory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{historySearchTerm ? "No interviews found matching your search." : "No interviews have been scheduled yet."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Panel</TableHead>
                    <TableHead>Meeting Link</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Scheduled Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInterviewHistory.map((interview: any) => (
                    <TableRow key={interview.id}>
                      <TableCell className="font-medium">
                        {interview.candidates?.full_name || interview.candidate_name || "N/A"}
                      </TableCell>
                      <TableCell>{interview.candidates?.email || "N/A"}</TableCell>
                      <TableCell>
                        {interview.candidates?.jobs?.job_title || "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={interview.interview_mode === "Online" ? "default" : "secondary"}>
                          {interview.interview_mode}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {interview.interview_date
                          ? format(new Date(interview.interview_date), "MMM dd, yyyy HH:mm")
                          : "N/A"}
                      </TableCell>
                      <TableCell>{interview.interview_panel || "N/A"}</TableCell>
                      <TableCell>
                        {(() => {
                          const meetingLink = extractMeetingLink(interview.notes);
                          // Also check if interview_mode is Online - should have a link
                          if (interview.interview_mode === "Online" && !meetingLink) {
                            // If it's online but no link found, show a message
                            return (
                              <span className="text-muted-foreground text-sm text-xs">
                                Link not provided
                              </span>
                            );
                          }
                          return meetingLink ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                window.open(meetingLink, '_blank', 'noopener,noreferrer');
                              }}
                              className="flex items-center gap-1"
                            >
                              <Video className="h-4 w-4" />
                              Join Meeting
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          if (interview.interview_mode === "Offline") {
                            const locationInfo = extractLocationDetails(interview.notes);
                            return locationInfo.location ? (
                              <div className="max-w-xs">
                                <p className="text-sm truncate" title={locationInfo.location}>
                                  {locationInfo.location}
                                </p>
                                {locationInfo.room && (
                                  <p className="text-xs text-muted-foreground">
                                    Room: {locationInfo.room}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            );
                          }
                          return <span className="text-muted-foreground text-sm">—</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        {interview.created_at
                          ? format(new Date(interview.created_at), "MMM dd, yyyy HH:mm")
                          : "N/A"}
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

    </div>
  );
}


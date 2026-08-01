import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CandidateCard from "@/components/CandidateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Award, Loader2, Upload, Search, UserPlus, Edit, Trash2, History, ExternalLink, MessageSquare } from "lucide-react";
import { openResume } from "@/lib/resume";
import { format } from "date-fns";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CertificateGenerator from "@/components/CertificateGenerator";

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  status: string;
  job_id: string | null;
  feedback_rating?: number | null;
  feedback_decision?: "Approve" | "Reject" | null;
  document_verification_status?: string | null;
  // Populated from the candidate's issued offer letter (offer-letters table).
  internship_start?: string | null;
  internship_end?: string | null;
  offer_position?: string | null;
  jobs?: {
    job_title: string;
    department: string | null;
  } | null;
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

export default function ExperienceLetter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCandidate, setUploadCandidate] = useState<Candidate | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [addCandidateDialogOpen, setAddCandidateDialogOpen] = useState(false);
  const [repliesDialogOpen, setRepliesDialogOpen] = useState(false);
  const [selectedCandidateForReplies, setSelectedCandidateForReplies] = useState<Candidate | null>(null);
  const [newCandidateForm, setNewCandidateForm] = useState({
    name: "",
    email: "",
    phone: "",
    resumeFile: null as File | null,
  });
  const [uploadingResume, setUploadingResume] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState<Candidate | null>(null);
  const [activeTab, setActiveTab] = useState("generate");
  const [historySearchTerm, setHistorySearchTerm] = useState("");

  // An experience letter is issued at the END of an internship — so eligibility
  // is NOT the interview feedback decision. A candidate is eligible only when:
  //   1. an offer was issued (a row exists in offer-letters), AND
  //   2. the internship closing date (offer end_date) is today or earlier, AND
  //   3. they do not already have an experience letter (one per candidate).
  // The internship dates from the offer are attached so the certificate
  // pre-fills with the exact offer period.
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["all-candidates-for-experience"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      // 1. Offers whose internship closing date has passed (offer issued + closed).
      const { data: offers, error: offersError } = await (supabase.from("offer-letters") as any)
        .select("candidate_id, position, start_date, end_date")
        .not("candidate_id", "is", null)
        .lte("end_date", today)
        .order("end_date", { ascending: false });
      if (offersError) throw offersError;

      // Latest passed offer per candidate.
      const offerByCandidate = new Map<
        string,
        { start_date: string | null; end_date: string | null; position: string | null }
      >();
      (offers ?? []).forEach((o: any) => {
        if (o.candidate_id && !offerByCandidate.has(o.candidate_id)) {
          offerByCandidate.set(o.candidate_id, {
            start_date: o.start_date,
            end_date: o.end_date,
            position: o.position,
          });
        }
      });

      if (offerByCandidate.size === 0) return [] as Candidate[];

      // 2. Candidates who already have an experience letter — excluded (unique).
      const { data: issued, error: issuedError } = await (supabase.from("experience-letters") as any)
        .select("candidate_id");
      if (issuedError) throw issuedError;
      const issuedSet = new Set(
        (issued ?? []).map((i: any) => i.candidate_id).filter(Boolean),
      );

      const eligibleIds = Array.from(offerByCandidate.keys()).filter(
        (id) => !issuedSet.has(id),
      );
      if (eligibleIds.length === 0) return [] as Candidate[];

      // 3. Candidate details for the eligible set.
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
          feedback_decision,
          document_verification_status,
          jobs (
            job_title,
            department
          )
        `)
        .in("id", eligibleIds)
        .or("is_archived.is.null,is_archived.eq.false")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Attach the offer's internship period for prefill + display.
      return ((data ?? []) as unknown as Candidate[]).map((c) => {
        const o = offerByCandidate.get(c.id);
        return {
          ...c,
          internship_start: o?.start_date ?? null,
          internship_end: o?.end_date ?? null,
          offer_position: o?.position ?? null,
        };
      });
    },
  });

  // Fetch all experience letters history
  const { data: experienceLettersHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["experience-letters-history"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("experience-letters") as any)
        .select(`
          id,
          candidate_id,
          experience_letter_url,
          file_name,
          file_type,
          email,
          email_sent,
          created_at,
          updated_at,
          candidates (
            id,
            full_name,
            email,
            phone
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Upload experience letter mutation
  const uploadExperienceLetterMutation = useMutation({
    mutationFn: async ({ file, candidate, email }: { file: File; candidate: Candidate; email: string }) => {
      // 1. Upload file to Supabase storage
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const storageFileName = `experience-letter-${candidate.id}-${timestamp}-${sanitizedFileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("experience-letters")
        .upload(storageFileName, file, {
          contentType: file.type || "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 2. Get public URL
      const { data: urlData } = supabase.storage
        .from("experience-letters")
        .getPublicUrl(uploadData.path);
      
      const experienceLetterUrl = urlData.publicUrl;

      // 3. Convert file to base64 for email attachment
      // Use chunk-based conversion to avoid "Maximum call stack size exceeded" error for large files
      const fileArrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(fileArrayBuffer);
      const chunkSize = 8192; // Process in 8KB chunks
      let fileBase64 = '';
      
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        fileBase64 += String.fromCharCode.apply(null, Array.from(chunk));
      }
      fileBase64 = btoa(fileBase64);

      // 4. Optionally send email with attachment (skip if already sent)
      let emailSent = false;
      const { data: existingLogs, error: historyError } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("action", "EXPERIENCE_LETTER_EMAIL_SENT")
        .ilike("details", `%${email}%`)
        .limit(1);

      if (historyError) {
        console.error("Failed to check experience letter email history:", historyError);
      }

      if (!existingLogs || existingLogs.length === 0) {
      const { data: emailData, error: emailError } = await supabase.functions.invoke("send-email", {
        body: {
          to: email,
          candidateName: candidate.full_name,
          emailType: "experience-letter-upload",
          data: {
            positionTitle: candidate.jobs?.job_title || "Intern",
            attachment: {
              filename: file.name,
              content: fileBase64,
              type: file.type || "application/pdf",
            },
            experience_letter_url: experienceLetterUrl,
          },
        },
      });

      if (emailError || !emailData?.success) {
        console.warn("Email sending failed, but file uploaded:", emailError || emailData?.error);
        // Don't throw - file is uploaded successfully
        } else {
          emailSent = true;
          await supabase.from("activity_logs").insert({
            action: "EXPERIENCE_LETTER_EMAIL_SENT",
            details: `Experience letter email sent to ${candidate.full_name} (${email})`,
          });
        }
      }

      // 5. Save to database
      const { error: dbError } = await (supabase.from("experience-letters") as any).insert({
        candidate_id: candidate.id,
        experience_letter_url: experienceLetterUrl,
        file_name: file.name,
        file_type: file.type || "application/pdf",
        email: email,
        email_sent: emailSent,
      });

      if (dbError) {
        console.error("Failed to save experience letter to database:", dbError);
        // Don't throw - file is uploaded successfully
      }

      // 6. Log activity
      await supabase.from("activity_logs").insert({
        action: "EXPERIENCE_LETTER_UPLOADED",
        details: `Experience letter uploaded for ${candidate.full_name}. File: ${file.name}`,
      });

      return { experienceLetterUrl, emailSent };
    },
    onSuccess: (result, variables) => {
      toast({
        title: "Experience Letter Uploaded",
        description: result.emailSent 
          ? `Experience letter uploaded and email sent to ${variables.email}`
          : `Experience letter uploaded. Email ${result.emailSent ? 'sent' : 'failed to send'}`,
      });
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadCandidate(null);
      queryClient.invalidateQueries({ queryKey: ["all-candidates-for-experience"] });
      queryClient.invalidateQueries({ queryKey: ["experience-letters-history"] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload experience letter",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (candidate: Candidate) => {
    setUploadCandidate(candidate);
    setIsUploadDialogOpen(true);
  };

  // Fetch email replies for experience-letter stage
  const { data: emailReplies = [] } = useQuery({
    queryKey: ["email-replies-experience"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_replies")
        .select("*")
        .eq("email_stage", "experience-letter")
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

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !uploadCandidate) {
      toast({
        title: "Validation Error",
        description: "Please select a file and candidate",
        variant: "destructive",
      });
      return;
    }

    const email = uploadCandidate.email;
    if (!email) {
      toast({
        title: "Validation Error",
        description: "Candidate email is required",
        variant: "destructive",
      });
      return;
    }

    uploadExperienceLetterMutation.mutate({ 
      file: selectedFile, 
      candidate: uploadCandidate,
      email: email,
    });
  };

  const handleViewResume = async (resumeUrl: string) => {
    await openResume(resumeUrl);
  };

  const handleViewExperienceLetter = async (experienceLetterUrl: string) => {
    try {
      if (!experienceLetterUrl) {
        toast({
          title: "Error",
          description: "Experience letter URL is not available",
          variant: "destructive",
        });
        return;
      }

      // Check if it's already a full URL (http/https)
      if (experienceLetterUrl.startsWith('http://') || experienceLetterUrl.startsWith('https://')) {
        // Check if it's a Supabase storage public URL
        const supabaseStorageMatch = experienceLetterUrl.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
        
        if (supabaseStorageMatch) {
          const bucket = supabaseStorageMatch[1];
          const path = supabaseStorageMatch[2];
          
          // Try to create signed URL as fallback (more reliable)
          try {
            const { data, error } = await supabase.storage
              .from(bucket)
              .createSignedUrl(path, 3600);
            
            if (!error && data?.signedUrl) {
              window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
              return;
            }
          } catch (signedUrlError) {
            console.warn('Signed URL failed, trying public URL:', signedUrlError);
          }
        }
        
        // If signed URL fails or not a Supabase URL, try direct open
        window.open(experienceLetterUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      // If it's a storage path (not a full URL), extract bucket and path
      let bucket = 'experience-letters';
      let path = experienceLetterUrl;

      // Handle different path formats
      if (experienceLetterUrl.includes('/')) {
        const parts = experienceLetterUrl.split('/');
        if (parts[0] === 'experience-letters' || parts[0] === 'offer-letters') {
          bucket = parts[0];
          path = parts.slice(1).join('/');
        } else {
          bucket = 'experience-letters';
          path = experienceLetterUrl;
        }
      }

      // Try to create signed URL
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);

      if (error) {
        console.error('Error creating signed URL:', error);
        // Try public URL as fallback
        try {
          const { data: publicUrlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);
          
          if (publicUrlData?.publicUrl) {
            window.open(publicUrlData.publicUrl, '_blank', 'noopener,noreferrer');
            return;
          }
        } catch (publicUrlError) {
          console.error('Public URL also failed:', publicUrlError);
        }
        
        toast({
          title: "Error",
          description: error.message || "Could not open experience letter. The file may not exist or the bucket may not be accessible.",
          variant: "destructive",
        });
        return;
      }

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      console.error('Error viewing experience letter:', err);
      toast({
        title: "Error",
        description: err.message || "Could not open experience letter",
        variant: "destructive",
      });
    }
  };

  // Compute file hash for duplicate detection
  const computeFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // Handle add candidate
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
        await supabase
          .from("resume_upload_hashes")
          .insert({ file_hash: resumeHash, original_name: file.name })
          .then(() => {}, () => {}); // Ignore errors if hash already exists
      }

      // Create candidate record
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

      let finalCandidate: Candidate | null = null;

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
              resume_processed: resumeUrl ? false : undefined,
            })
            .eq("email", emailTrimmed.toLowerCase())
            .select(`
              id,
              full_name,
              email,
              phone,
              resume_url,
              status,
              job_id,
              jobs (
                job_title,
                department
              )
            `)
            .single();

          if (updateError) {
            throw updateError;
          }

          toast({
            title: "Candidate Updated",
            description: "Candidate with this email already exists. Updated the record.",
          });

          finalCandidate = updatedCandidate as unknown as Candidate;
        } else {
          throw insertError;
        }
      } else {
        toast({
          title: "Candidate Added",
          description: "New candidate has been added successfully.",
        });
        finalCandidate = newCandidate as unknown as Candidate;
      }

      // Refresh the candidates list
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-for-experience"] });
      await queryClient.refetchQueries({ queryKey: ["all-candidates-for-experience"] });

      // Reset form
      setNewCandidateForm({
        name: "",
        email: "",
        phone: "",
        resumeFile: null,
      });
      setAddCandidateDialogOpen(false);

      // If candidate was added/updated, automatically open upload experience letter dialog
      if (finalCandidate) {
        // Small delay to ensure add dialog closes first
        setTimeout(() => {
          setUploadCandidate(finalCandidate);
          setIsUploadDialogOpen(true);
          toast({
            title: "Ready to Upload",
            description: "You can now upload and send the experience letter to this candidate.",
          });
        }, 300);
      }
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
      return nameMatch || emailMatch || phoneMatch;
    });
  }, [candidates, searchTerm]);

  // Filter experience letters history based on search term
  const filteredExperienceLettersHistory = useMemo(() => {
    if (!historySearchTerm.trim()) {
      return experienceLettersHistory;
    }
    
    const searchLower = historySearchTerm.toLowerCase();
    return experienceLettersHistory.filter((letter: any) => {
      const nameMatch = letter.candidates?.full_name?.toLowerCase().includes(searchLower);
      const emailMatch = letter.email?.toLowerCase().includes(searchLower);
      const fileNameMatch = letter.file_name?.toLowerCase().includes(searchLower);
      const fileTypeMatch = letter.file_type?.toLowerCase().includes(searchLower);
      return nameMatch || emailMatch || fileNameMatch || fileTypeMatch;
    });
  }, [experienceLettersHistory, historySearchTerm]);

  // Handle edit click
  const handleEditClick = (candidate: Candidate) => {
    setEditingCandidate(candidate);
    setEditForm({
      name: candidate.full_name,
      email: candidate.email,
      phone: candidate.phone || "",
    });
    setEditDialogOpen(true);
  };

  // Handle delete click
  const handleDeleteClick = (candidate: Candidate) => {
    setCandidateToDelete(candidate);
    setDeleteDialogOpen(true);
  };

  // Delete candidate mutation
  const deleteCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase
        .from("candidates")
        .delete()
        .eq("id", candidateId);

      if (error) throw error;
    },
    onSuccess: async () => {
      toast({
        title: "Candidate Deleted",
        description: "Candidate has been deleted successfully.",
      });
      setDeleteDialogOpen(false);
      setCandidateToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-for-experience"] });
      await queryClient.refetchQueries({ queryKey: ["all-candidates-for-experience"] });
    },
    onError: (error: any) => {
      console.error("Error deleting candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete candidate.",
        variant: "destructive",
      });
    },
  });

  // Handle confirm delete
  const handleConfirmDelete = () => {
    if (candidateToDelete) {
      deleteCandidateMutation.mutate(candidateToDelete.id);
    }
  };

  // Handle save edit
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
      const { error: updateError } = await supabase
        .from("candidates")
        .update({
          full_name: editForm.name.trim(),
          email: emailTrimmed.toLowerCase(),
          phone: editForm.phone.trim() || null,
        })
        .eq("id", editingCandidate.id);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Candidate Updated",
        description: "Candidate information has been updated successfully.",
      });

      setEditDialogOpen(false);
      setEditingCandidate(null);
      setEditForm({
        name: "",
        email: "",
        phone: "",
      });

      // Refresh candidates list
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-for-experience"] });
      await queryClient.refetchQueries({ queryKey: ["all-candidates-for-experience"] });
    } catch (error: any) {
      console.error("Error updating candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update candidate information.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Experience Letter</h1>
          <p className="text-muted-foreground mt-1">
            For interns whose offer was issued and whose internship closing date has passed — one certificate per intern
          </p>
        </div>
        <Button 
          onClick={() => setAddCandidateDialogOpen(true)}
          className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Add New Candidate
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            Auto-Generate &amp; Send
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Manual Upload
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History ({experienceLettersHistory.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-6">
          <CertificateGenerator candidates={candidates} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="upload" className="space-y-6 mt-6">
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
            placeholder="Search by name, email, or phone"
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-6">
        {filteredCandidates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{searchTerm ? "No candidates found matching your search." : "No interns are eligible yet. A candidate appears here once their offer is issued and their internship closing date has passed (and they don't already have an experience letter)."}</p>
          </div>
        ) : (
          filteredCandidates.map((candidate) => (
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
                <Button 
                  onClick={() => handleEditClick(candidate)}
                  variant="outline"
                  size="sm"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  onClick={() => handleDeleteClick(candidate)}
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
                <Button 
                  onClick={() => handleFileSelect(candidate)}
                  variant="outline"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Experience Letter
                </Button>
              </div>
            </CandidateCard>
          ))
        )}
      </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
      {/* Experience Letter History Section */}
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <History className="h-5 w-5" />
                Experience Letter History
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Complete history of all issued experience letters
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
                placeholder="Search by name, email, file name, or file type"
                className="pl-9"
              />
            </div>
          </div>

          {isHistoryLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredExperienceLettersHistory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{historySearchTerm ? "No experience letters found matching your search." : "No experience letters have been issued yet."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>File Type</TableHead>
                    <TableHead>Email Sent</TableHead>
                    <TableHead>Issued Date</TableHead>
                    <TableHead>Document</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExperienceLettersHistory.map((letter: any) => (
                    <TableRow key={letter.id}>
                      <TableCell className="font-medium">
                        {letter.candidates?.full_name || "N/A"}
                      </TableCell>
                      <TableCell>{letter.email}</TableCell>
                      <TableCell>{letter.file_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {letter.file_type || "PDF"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={letter.email_sent ? "default" : "secondary"}
                        >
                          {letter.email_sent ? "Sent" : "Not Sent"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {letter.created_at
                          ? format(new Date(letter.created_at), "MMM dd, yyyy HH:mm")
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {letter.experience_letter_url ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewExperienceLetter(letter.experience_letter_url)}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
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

      {/* Upload Experience Letter Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Experience Letter</DialogTitle>
            <DialogDescription>
              Upload a manually created experience letter for {uploadCandidate?.full_name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFileUpload} className="space-y-4 mt-4">
            <div>
              <Label>Candidate Email</Label>
              <Input
                value={uploadCandidate?.email || ""}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label>Experience Letter File (PDF/HTML/DOC) *</Label>
              <Input
                type="file"
                accept=".pdf,.html,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // Check file size (max 10MB)
                    if (file.size > 10 * 1024 * 1024) {
                      toast({
                        title: "File too large",
                        description: "Maximum file size is 10MB",
                        variant: "destructive",
                      });
                      return;
                    }
                    setSelectedFile(file);
                  }
                }}
                required
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-2">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsUploadDialogOpen(false);
                  setSelectedFile(null);
                  setUploadCandidate(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={uploadExperienceLetterMutation.isPending || !selectedFile}
              >
                {uploadExperienceLetterMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload & Send Email
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Candidate Dialog */}
      <Dialog open={addCandidateDialogOpen} onOpenChange={setAddCandidateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Candidate</DialogTitle>
            <DialogDescription>
              Add a new candidate to the system. You can upload their resume if available.
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
              {uploadingResume ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Candidate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Candidate Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Candidate Information</DialogTitle>
            <DialogDescription>
              Update candidate details. You can modify name, email, and phone number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Enter candidate name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
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
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setEditingCandidate(null);
                setEditForm({
                  name: "",
                  email: "",
                  phone: "",
                });
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Delete Candidate</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{candidateToDelete?.full_name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setCandidateToDelete(null);
              }}
              disabled={deleteCandidateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteCandidateMutation.isPending}
            >
              {deleteCandidateMutation.isPending ? (
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Replies Dialog */}
      <Dialog open={repliesDialogOpen} onOpenChange={setRepliesDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Replies from {selectedCandidateForReplies?.full_name || "Candidate"}</DialogTitle>
            <DialogDescription>
              Email replies received for experience letter stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedCandidateForReplies && getCandidateReplies(selectedCandidateForReplies).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No email replies received yet from this candidate for experience letter stage.</p>
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


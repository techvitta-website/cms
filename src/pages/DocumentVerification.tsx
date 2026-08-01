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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Mail, Search, Eye, CheckCircle, XCircle, Clock, FileText, Download, File, Copy } from "lucide-react";
import { openResume } from "@/lib/resume";
import { useAuth } from "@/context/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COMPANY_NAME = "Techvitta Innovations Pvt Ltd";

// Document types matching the email template
const DOCUMENT_TYPES = [
  { id: 'educational_credentials', label: 'Educational Credentials 10th to Highest', required: true },
  { id: 'resume_copy', label: 'Latest resume copy. (Updated) with local address.', required: true },
  { id: 'id_proof', label: 'ID proof (Aadhar Card & PAN Card) For KYC', required: true },
  { id: 'professional_certificates', label: 'Professional / Course Certificates (If Any)', required: false },
  { id: 'previous_employment', label: 'Previously offer letters & Relieving letters, internship certificates (If Any)', required: false },
];

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
  document_verification_status?: string | null;
  jobs?: {
    job_title: string;
    department: string | null;
  } | null;
}

interface CandidateDocument {
  id: string;
  candidate_id: string;
  document_type: string;
  document_name: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string;
  verification_status: string;
  verification_notes: string | null;
  verified_at: string | null;
}

export default function DocumentVerification() {
  const { toast } = useToast();
  const { hrUser } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isSendEmailDialogOpen, setIsSendEmailDialogOpen] = useState(false);
  const [isViewDocumentsDialogOpen, setIsViewDocumentsDialogOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [candidateDocuments, setCandidateDocuments] = useState<CandidateDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null);
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [verifyingRowId, setVerifyingRowId] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [documentToReject, setDocumentToReject] = useState<{ docId: string; docType: string } | null>(null);

  // CID verification is a post-approval step ("before sending offer letters"),
  // so only candidates approved in feedback (feedback_decision = 'Approve') or
  // with the canonical status 'Approved' are eligible.
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["approved-candidates-documents"],
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
          document_verification_status,
          created_at,
          jobs (
            job_title,
            department
          )
        `)
        .or("feedback_decision.eq.Approve,status.eq.Approved")
        .or("is_archived.is.null,is_archived.eq.false")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as Candidate[];
    },
    refetchInterval: 10000, // Refresh every 10 seconds to catch status updates
  });

  // Fetch document counts for each candidate (refresh every 10 seconds to catch new uploads)
  const { data: documentCounts = {} } = useQuery({
    queryKey: ["candidate-document-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_documents")
        .select("candidate_id");

      if (error) throw error;
      
      const counts: { [key: string]: number } = {};
      (data || []).forEach((doc: any) => {
        counts[doc.candidate_id] = (counts[doc.candidate_id] || 0) + 1;
      });
      
      return counts;
    },
    refetchInterval: 10000, // Refresh every 10 seconds to catch new document uploads
  });

  // Fetch upload links from activity logs for candidates with requested status
  const { data: uploadLinks = {} } = useQuery({
    queryKey: ["candidate-upload-links", candidates.length],
    queryFn: async () => {
      // Fetch activity logs
      const { data: logsData, error: logsError } = await supabase
        .from("activity_logs")
        .select("details, created_at")
        .eq("action", "CID_DOCUMENT_REQUEST_SENT")
        .order("created_at", { ascending: false });

      if (logsError) throw logsError;
      
      // Fetch all approved candidates to match emails
      const { data: candidatesData, error: candidatesError } = await supabase
        .from("candidates")
        .select("id, email")
        .or("feedback_decision.eq.Approve,status.eq.Approved");

      if (candidatesError) throw candidatesError;
      
      const links: { [key: string]: string } = {};
      const candidateEmailMap: { [key: string]: string } = {};
      
      // Create email to candidate ID mapping
      (candidatesData || []).forEach((candidate: any) => {
        candidateEmailMap[candidate.email.toLowerCase()] = candidate.id;
      });
      
      // Extract links from activity logs
      (logsData || []).forEach((log: any) => {
        // Extract candidate email and link from details
        // Format: "CID document request email sent to {name} ({email}) with link: {link}"
        const linkMatch = log.details?.match(/with link: (https?:\/\/[^\s]+)/);
        const emailMatch = log.details?.match(/\(([^)]+@[^)]+)\)/);
        
        if (linkMatch && emailMatch) {
          const email = emailMatch[1].toLowerCase();
          const link = linkMatch[1];
          const candidateId = candidateEmailMap[email];
          
          // Only store the most recent link for each candidate
          if (candidateId && !links[candidateId]) {
            links[candidateId] = link;
          }
        }
      });
      
      return links;
    },
    enabled: candidates.length > 0,
    refetchInterval: 10000,
  });

  // Filter candidates based on document verification status
  const filteredCandidates = useMemo(() => {
    let filtered = candidates;

    // Filter by tab
    if (activeTab === "pending") {
      filtered = candidates.filter(
        (c) => !c.document_verification_status || c.document_verification_status === "not_requested"
      );
    } else if (activeTab === "requested") {
      filtered = candidates.filter((c) => c.document_verification_status === "requested");
    } else if (activeTab === "submitted") {
      filtered = candidates.filter((c) => c.document_verification_status === "submitted");
    } else if (activeTab === "verified") {
      filtered = candidates.filter((c) => c.document_verification_status === "verified");
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.full_name.toLowerCase().includes(term) ||
          c.email.toLowerCase().includes(term) ||
          c.phone?.toLowerCase().includes(term) ||
          c.jobs?.job_title?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [candidates, activeTab, searchTerm]);

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      pending: candidates.filter(
        (c) => !c.document_verification_status || c.document_verification_status === "not_requested"
      ).length,
      requested: candidates.filter((c) => c.document_verification_status === "requested").length,
      submitted: candidates.filter((c) => c.document_verification_status === "submitted").length,
      verified: candidates.filter((c) => c.document_verification_status === "verified").length,
    };
  }, [candidates]);

  const handleViewResume = (resumeUrl: string | null) => {
    if (resumeUrl) {
      openResume(resumeUrl);
    }
  };

  const handleSendDocumentRequest = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setIsSendEmailDialogOpen(true);
  };

  const handleViewDocuments = async (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setIsViewDocumentsDialogOpen(true);
    setLoadingDocuments(true);
    
    try {
      const { data, error } = await supabase
        .from('candidate_documents')
        .select('*')
        .eq('candidate_id', candidate.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      // Filter documents: Show only latest per type/subtype
      // If there's a non-rejected document, hide rejected ones
      if (data && data.length > 0) {
        const allDocs = data as CandidateDocument[];
        const filteredDocs: CandidateDocument[] = [];
        const docsByType: { [key: string]: CandidateDocument[] } = {};

        // Group documents by type
        allDocs.forEach((doc) => {
          const docType = doc.document_type;
          if (!docsByType[docType]) {
            docsByType[docType] = [];
          }
          docsByType[docType].push(doc);
        });

        // Filter each document type
        Object.keys(docsByType).forEach((docType) => {
          const docs = docsByType[docType];
          const docConfig = DOCUMENT_TYPES.find((d) => d.id === docType);
          const allowMultiple = docConfig && docConfig.id === 'educational_credentials'; // Educational credentials allows multiple
          
          if (docType === "id_proof") {
            // For ID proof, handle aadhar and pan separately (both are single-upload)
            const aadharDocs = docs.filter((d) => 
              d.document_name?.toLowerCase().includes("aadhar")
            ).sort((a, b) => 
              new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
            );
            
            const panDocs = docs.filter((d) => 
              d.document_name?.toLowerCase().includes("pan")
            ).sort((a, b) => 
              new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
            );

            // Show only latest aadhar doc
            if (aadharDocs.length > 0) {
              filteredDocs.push(aadharDocs[0]);
            }

            // Show only latest pan doc
            if (panDocs.length > 0) {
              filteredDocs.push(panDocs[0]);
            }
          } else if (allowMultiple) {
            // For multi-upload documents (like educational_credentials)
            // Show all non-rejected documents, or all if all are rejected
            const hasNonRejected = docs.some((d) => d.verification_status !== "rejected");
            const filtered = hasNonRejected
              ? docs.filter((d) => d.verification_status !== "rejected")
              : docs;
            filteredDocs.push(...filtered);
          } else {
            // For single-upload document types, show only the latest document
            // Documents are already sorted by uploaded_at desc
            if (docs.length > 0) {
              filteredDocs.push(docs[0]);
            }
          }
        });

        setCandidateDocuments(filteredDocs);
      } else {
        setCandidateDocuments([]);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoadingDocuments(false);
    }
  };

  const handleViewDocument = async (fileUrl: string) => {
    try {
      const [bucket, ...fileParts] = fileUrl.split('/');
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
        title: "Error viewing document",
        description: err.message || "Could not open document",
        variant: "destructive",
      });
    }
  };

  const handleDownloadDocument = async (fileUrl: string, fileName: string) => {
    try {
      const [bucket, ...fileParts] = fileUrl.split('/');
      const filePath = fileParts.join('/');
      
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);
      
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
        title: "Error downloading document",
        description: err.message || "Could not download document",
        variant: "destructive",
      });
    }
  };

  const handleVerifyAllDocuments = async () => {
    if (!selectedCandidate) return;
    
    setVerifyingDocId('all');
    try {
      // verified_by must reference hr_users.id (FK constraint) — NOT the auth
      // uid. For some HR accounts those ids differ, which made every
      // verify/reject fail with a foreign-key violation.
      const verifiedBy = hrUser?.id ?? null;

      // Verify every document that isn't already verified — including ones that
      // were previously rejected/set back, so HR can re-verify them in bulk.
      const pendingDocs = candidateDocuments.filter(doc => doc.verification_status !== 'verified');

      if (pendingDocs.length === 0) {
        toast({
          title: "Nothing to verify",
          description: "All documents are already verified.",
          variant: "default",
        });
        setVerifyingDocId(null);
        return;
      }

      // Update all pending documents to verified
      const docIds = pendingDocs.map(doc => doc.id);
      const { error } = await supabase
        .from('candidate_documents')
        .update({
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: verifiedBy,
        })
        .in('id', docIds);

      if (error) throw error;

      // Update local state
      setCandidateDocuments(prev =>
        prev.map(doc =>
          doc.verification_status !== 'verified'
            ? {
                ...doc,
                verification_status: 'verified',
                verified_at: new Date().toISOString(),
              }
            : doc
        )
      );

      // Check if all required documents are verified
      const updatedDocs = candidateDocuments.map(doc =>
        doc.verification_status !== 'verified' ? { ...doc, verification_status: 'verified' } : doc
      );
      const allRequiredDocs = updatedDocs.filter(doc => 
        ['educational_credentials', 'resume_copy', 'id_proof'].includes(doc.document_type)
      );
      const allRequiredVerified = allRequiredDocs.length > 0 && 
        allRequiredDocs.every(doc => doc.verification_status === 'verified');

      if (allRequiredVerified) {
        // Update candidate status to verified
        await supabase
          .from('candidates')
          .update({ document_verification_status: 'verified' })
          .eq('id', selectedCandidate.id);
        
        queryClient.invalidateQueries({ queryKey: ["approved-candidates-documents"] });
        queryClient.invalidateQueries({ queryKey: ["candidate-document-counts"] });
      }

      toast({
        title: "All Documents Verified",
        description: `${pendingDocs.length} document(s) have been verified successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to verify documents",
        variant: "destructive",
      });
    } finally {
      setVerifyingDocId(null);
    }
  };

  const handleRejectAllDocuments = async () => {
    if (!selectedCandidate) return;
    
    setVerifyingDocId('reject-all');
    try {
      // verified_by must reference hr_users.id (FK constraint) — NOT the auth
      // uid. For some HR accounts those ids differ, which made every
      // verify/reject fail with a foreign-key violation.
      const verifiedBy = hrUser?.id ?? null;

      // Get all pending documents
      const pendingDocs = candidateDocuments.filter(doc => doc.verification_status === 'pending');
      
      if (pendingDocs.length === 0) {
        toast({
          title: "No Pending Documents",
          description: "All documents have already been processed.",
          variant: "default",
        });
        setVerifyingDocId(null);
        return;
      }

      // Update all pending documents to rejected
      const docIds = pendingDocs.map(doc => doc.id);
      const { error } = await supabase
        .from('candidate_documents')
        .update({
          verification_status: 'rejected',
          verified_at: new Date().toISOString(),
          verified_by: verifiedBy,
        })
        .in('id', docIds);

      if (error) throw error;

      // Update local state
      setCandidateDocuments(prev =>
        prev.map(doc =>
          doc.verification_status === 'pending'
            ? {
                ...doc,
                verification_status: 'rejected',
                verified_at: new Date().toISOString(),
              }
            : doc
        )
      );

      toast({
        title: "All Documents Rejected",
        description: `${pendingDocs.length} document(s) have been rejected.`,
        variant: "destructive",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject documents",
        variant: "destructive",
      });
    } finally {
      setVerifyingDocId(null);
    }
  };

  const handleVerifyDocument = async (docId: string) => {
    if (!selectedCandidate) return;
    
    setVerifyingDocId(docId);
    try {
      // verified_by must reference hr_users.id (FK constraint) — NOT the auth
      // uid. For some HR accounts those ids differ, which made every
      // verify/reject fail with a foreign-key violation.
      const verifiedBy = hrUser?.id ?? null;

      // Update document to verified
      const { error } = await supabase
        .from('candidate_documents')
        .update({
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: verifiedBy,
        })
        .eq('id', docId);

      if (error) throw error;

      // Update local state
      setCandidateDocuments(prev =>
        prev.map(doc =>
          doc.id === docId
            ? {
                ...doc,
                verification_status: 'verified',
                verified_at: new Date().toISOString(),
              }
            : doc
        )
      );

      // Check if all required documents are verified
      const updatedDocs = candidateDocuments.map(doc =>
        doc.id === docId ? { ...doc, verification_status: 'verified' } : doc
      );
      const allRequiredDocs = updatedDocs.filter(doc => 
        ['educational_credentials', 'resume_copy', 'id_proof'].includes(doc.document_type)
      );
      const allRequiredVerified = allRequiredDocs.length > 0 && 
        allRequiredDocs.every(doc => doc.verification_status === 'verified');

      if (allRequiredVerified) {
        // Update candidate status to verified
        await supabase
          .from('candidates')
          .update({ document_verification_status: 'verified' })
          .eq('id', selectedCandidate.id);
        
        queryClient.invalidateQueries({ queryKey: ["approved-candidates-documents"] });
        queryClient.invalidateQueries({ queryKey: ["candidate-document-counts"] });
      }

      toast({
        title: "Document Verified",
        description: "Document has been verified successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to verify document",
        variant: "destructive",
      });
    } finally {
      setVerifyingDocId(null);
    }
  };

  const handleRejectDocument = async (docId: string) => {
    if (!selectedCandidate) return;
    
    // Find the document to get its type
    const doc = candidateDocuments.find(d => d.id === docId);
    const docTypeInfo = DOCUMENT_TYPES.find(d => d.id === doc?.document_type);
    const docTypeLabel = docTypeInfo?.label || doc?.document_name || "document";
    
    // Open rejection dialog
    setDocumentToReject({ docId, docType: docTypeLabel });
    setRejectFeedback("");
    setIsRejectDialogOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedCandidate || !documentToReject) return;
    
    setRejectingDocId(documentToReject.docId);
    setIsRejectDialogOpen(false);
    
    try {
      // verified_by must reference hr_users.id (FK constraint) — NOT the auth
      // uid. For some HR accounts those ids differ, which made every
      // verify/reject fail with a foreign-key violation.
      const verifiedBy = hrUser?.id ?? null;

      // Get upload link (from uploadLinks state or generate it)
      const uploadLink = uploadLinks[selectedCandidate.id] || `${window.location.origin}/${selectedCandidate.id}/upload-documents`;

      // Update document to rejected
      const { error } = await supabase
        .from('candidate_documents')
        .update({
          verification_status: 'rejected',
          verified_at: new Date().toISOString(),
          verified_by: verifiedBy,
          verification_notes: rejectFeedback || null,
        })
        .eq('id', documentToReject.docId);

      if (error) throw error;

      // Send rejection email with feedback and upload link
      const { data: emailData, error: emailError } = await supabase.functions.invoke("send-email", {
        body: {
          to: selectedCandidate.email,
          candidateName: selectedCandidate.full_name,
          emailType: "document-rejection",
          data: {
            companyName: COMPANY_NAME,
            positionTitle: selectedCandidate.jobs?.job_title || "the role",
            uploadLink: uploadLink,
            feedbackNotes: rejectFeedback || "The document does not meet our requirements. Please upload a corrected version.",
            documentType: documentToReject.docType,
          },
        },
      });

      if (emailError) {
        console.error("Email error:", emailError);
        // Don't throw - document is already rejected, just log the email error
      } else if (!emailData?.success) {
        console.error("Email failed:", emailData?.error);
      } else {
        // Log email sent activity
        void supabase.from("activity_logs").insert({
          action: "DOCUMENT_REJECTION_EMAIL_SENT",
          details: `Document rejection email sent to ${selectedCandidate.full_name} (${selectedCandidate.email}) for document: ${documentToReject.docType}`,
        });
      }

      // Update local state
      setCandidateDocuments(prev =>
        prev.map(doc =>
          doc.id === documentToReject.docId
            ? {
                ...doc,
                verification_status: 'rejected',
                verified_at: new Date().toISOString(),
                verification_notes: rejectFeedback || null,
              }
            : doc
        )
      );

      // A rejected/set-back document means the set is no longer fully verified,
      // so move the candidate back to "submitted" for re-review.
      await supabase
        .from('candidates')
        .update({ document_verification_status: 'submitted' })
        .eq('id', selectedCandidate.id);
      queryClient.invalidateQueries({ queryKey: ["approved-candidates-documents"] });

      toast({
        title: "Document Rejected",
        description: "Document has been rejected and email sent to candidate with feedback and upload link.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject document",
        variant: "destructive",
      });
    } finally {
      setRejectingDocId(null);
      setDocumentToReject(null);
      setRejectFeedback("");
    }
  };

  // One-click: verify all of a candidate's documents straight from the list,
  // without opening the dialog. Verifies every non-verified doc and marks the
  // candidate verified.
  const handleQuickVerifyAll = async (candidate: Candidate) => {
    setVerifyingRowId(candidate.id);
    try {
      const verifiedBy = hrUser?.id ?? null;
      const { data: docs, error } = await supabase
        .from("candidate_documents")
        .select("id, verification_status")
        .eq("candidate_id", candidate.id);
      if (error) throw error;

      const toVerify = (docs || []).filter((d: any) => d.verification_status !== "verified");
      if (toVerify.length > 0) {
        const { error: updErr } = await supabase
          .from("candidate_documents")
          .update({
            verification_status: "verified",
            verified_at: new Date().toISOString(),
            verified_by: verifiedBy,
          })
          .in(
            "id",
            toVerify.map((d: any) => d.id),
          );
        if (updErr) throw updErr;
      }

      await supabase
        .from("candidates")
        .update({ document_verification_status: "verified" })
        .eq("id", candidate.id);

      queryClient.invalidateQueries({ queryKey: ["approved-candidates-documents"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-document-counts"] });

      toast({
        title: "All documents verified",
        description: `${candidate.full_name}'s documents have been verified.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to verify documents",
        variant: "destructive",
      });
    } finally {
      setVerifyingRowId(null);
    }
  };

  // Send document request email mutation
  const sendDocumentRequestMutation = useMutation({
    mutationFn: async (candidate: Candidate) => {
      // Allow resending - don't prevent duplicate emails (for testing purposes)
      // Only check if this is the first time sending (not requested yet)
      if (!candidate.document_verification_status || candidate.document_verification_status === "not_requested") {
        const { data: existingLogs, error: historyError } = await supabase
          .from("activity_logs")
          .select("id")
          .eq("action", "CID_DOCUMENT_REQUEST_SENT")
          .ilike("details", `%${candidate.email}%`)
          .limit(1);

        if (!historyError && existingLogs && existingLogs.length > 0) {
          // Allow resending even if already sent - just log it
          console.log("Resending document request email to:", candidate.email);
        }
      }

      // Generate upload link using candidate ID (no token needed)
      const uploadLink = `${window.location.origin}/${candidate.id}/upload-documents`;
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7); // 7 days deadline

      // requested_by must reference hr_users.id (FK constraint) — NOT the auth
      // uid, which differs for some HR accounts.
      const requestedBy = hrUser?.id ?? null;

      // Update candidate status
      const { error: updateError } = await supabase
        .from("candidates")
        .update({
          document_verification_status: "requested",
        })
        .eq("id", candidate.id);

      if (updateError) throw updateError;

      // Call edge function to send email with upload link
      const { data: emailData, error: emailError } = await supabase.functions.invoke("send-email", {
        body: {
          to: candidate.email,
          candidateName: candidate.full_name,
          emailType: "cid-document-request",
          data: {
            companyName: COMPANY_NAME,
            positionTitle: candidate.jobs?.job_title || "the role",
            uploadLink: uploadLink,
            candidateId: candidate.id,
            deadline: deadline.toLocaleDateString("en-US", { 
              year: "numeric", 
              month: "long", 
              day: "numeric" 
            }),
            requiredDocuments: [
              "Educational Credentials 10th to Highest",
              "Latest resume copy. (Updated) with local address.",
              "ID proof (Aadhar Card & PAN Card) For KYC",
              "Professional / Course Certificates (If Any)",
              "Previously offer letters & Relieving letters, internship certificates (If Any)",
            ],
          },
        },
      });

      if (emailError) throw emailError;
      if (!emailData?.success) {
        throw new Error(emailData?.error || "Failed to send email");
      }

      return { uploadLink, deadline, candidateId: candidate.id };
    },
    onSuccess: (data, candidate) => {
      // Log document request email activity
      void supabase.from("activity_logs").insert({
        action: "CID_DOCUMENT_REQUEST_SENT",
        details: `CID document request email sent to ${candidate.full_name} (${candidate.email}) with link: ${data.uploadLink}`,
      });

      queryClient.invalidateQueries({ queryKey: ["approved-candidates-documents"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-document-counts"] });
      
      // Show the created link
      setCreatedLink(data.uploadLink);
      
      toast({
        title: "Upload Link Created & Email Sent",
        description: `Link created and email sent to ${candidate.email}`,
        duration: 5000,
      });
      
      // Keep dialog open to show the link for 10 seconds, then close
      setTimeout(() => {
        setIsSendEmailDialogOpen(false);
        setSelectedCandidate(null);
        setCreatedLink(null);
      }, 10000);
    },
    onError: (error: any) => {
      toast({
        title:
          error?.message === "Document request email has already been sent to this candidate."
            ? "Already sent"
            : "Error",
        description: error.message || "Failed to send document request",
        variant:
          error?.message === "Document request email has already been sent to this candidate."
            ? "default"
            : "destructive",
      });
    },
  });

  const handleSendEmail = () => {
    if (selectedCandidate) {
      sendDocumentRequestMutation.mutate(selectedCandidate);
    }
  };

  const getStatusBadge = (status: string | null | undefined) => {
    if (!status || status === "not_requested") {
      return <Badge variant="outline">Not Requested</Badge>;
    }
    const statusConfig: Record<string, { label: string; className: string }> = {
      requested: { label: "Requested", className: "bg-yellow-100 text-yellow-800" },
      submitted: { label: "Submitted", className: "bg-blue-100 text-blue-800" },
      verified: { label: "Verified", className: "bg-green-100 text-green-800" },
      rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
    };
    const config = statusConfig[status] || { label: status, className: "bg-gray-100 text-gray-800" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">CID Verification</h1>
        <p className="text-muted-foreground mt-1">
          Request and verify candidate identification documents before sending offer letters
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Request Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.requested}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documents Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.submitted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Verified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.verified}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">
            Pending {counts.pending > 0 && `(${counts.pending})`}
          </TabsTrigger>
          <TabsTrigger value="requested">
            Requested {counts.requested > 0 && `(${counts.requested})`}
          </TabsTrigger>
          <TabsTrigger value="submitted">
            Submitted {counts.submitted > 0 && `(${counts.submitted})`}
          </TabsTrigger>
          <TabsTrigger value="verified">
            Verified {counts.verified > 0 && `(${counts.verified})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search">SEARCH CANDIDATE</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by name, email, phone, or job title"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No candidates found</p>
            </div>
          ) : (
            <div className="grid gap-4">
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
                  onViewResume={() => handleViewResume(candidate.resume_url)}
                >
                  {(candidate.feedback_notes || candidate.feedback_rating) && (
                    <div className="mb-4 rounded-lg border border-muted bg-muted/40 p-4 text-sm space-y-1">
                      <p className="font-medium text-foreground">Interview Feedback</p>
                      {candidate.feedback_rating && (
                        <p className="text-muted-foreground">
                          Rating: {candidate.feedback_rating}/5
                        </p>
                      )}
                      {candidate.feedback_notes && (
                        <p className="text-muted-foreground whitespace-pre-wrap">
                          Notes: {candidate.feedback_notes}
                        </p>
                      )}
                    </div>
                  )}

                  {candidate.document_verification_status === "requested" && uploadLinks[candidate.id] && (
                    <div className="mb-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-semibold text-blue-900">Upload Link:</p>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-white border rounded-md">
                        <Input
                          value={uploadLinks[candidate.id]}
                          readOnly
                          className="flex-1 text-xs font-mono border-0 bg-transparent"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(uploadLinks[candidate.id]);
                            toast({
                              title: "Link Copied!",
                              description: "Upload link has been copied to clipboard",
                            });
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium whitespace-nowrap">Document Status:</span>
                      {getStatusBadge(candidate.document_verification_status)}
                      {documentCounts[candidate.id] > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {documentCounts[candidate.id]} document{documentCounts[candidate.id] > 1 ? 's' : ''} uploaded
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(!candidate.document_verification_status ||
                        candidate.document_verification_status === "not_requested") && (
                        <Button
                          onClick={() => handleSendDocumentRequest(candidate)}
                          className="bg-gradient-primary hover:opacity-90 text-primary-foreground whitespace-nowrap"
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Create Upload Link & Send Email
                        </Button>
                      )}
                      {candidate.document_verification_status === "requested" && (
                        <>
                          <Button
                            onClick={() => handleSendDocumentRequest(candidate)}
                            variant="outline"
                            className="whitespace-nowrap"
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Resend Link
                          </Button>
                          {documentCounts[candidate.id] > 0 && (
                            <Button
                              onClick={() => handleQuickVerifyAll(candidate)}
                              disabled={verifyingRowId === candidate.id}
                              className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                            >
                              {verifyingRowId === candidate.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Verifying...
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Verify All
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            onClick={() => handleViewDocuments(candidate)}
                            className="whitespace-nowrap"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Documents ({documentCounts[candidate.id] || 0})
                          </Button>
                        </>
                      )}
                      {candidate.document_verification_status === "submitted" && (
                        <>
                          <Button
                            onClick={() => handleQuickVerifyAll(candidate)}
                            disabled={verifyingRowId === candidate.id}
                            className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                          >
                            {verifyingRowId === candidate.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Verifying...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Verify All
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleViewDocuments(candidate)}
                            className="whitespace-nowrap"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Documents ({documentCounts[candidate.id] || 0})
                          </Button>
                        </>
                      )}
                      {candidate.document_verification_status === "verified" && (
                        <Button 
                          variant="outline" 
                          onClick={() => handleViewDocuments(candidate)} 
                          className="whitespace-nowrap"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Verified Documents ({documentCounts[candidate.id] || 0})
                        </Button>
                      )}
                    </div>
                  </div>
                </CandidateCard>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Send Document Request Dialog */}
      <Dialog open={isSendEmailDialogOpen} onOpenChange={setIsSendEmailDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Upload Link & Send Email</DialogTitle>
            <DialogDescription>
              A unique upload link will be generated and sent to the candidate via email. The candidate can use this link to upload all required documents.
            </DialogDescription>
          </DialogHeader>
          {selectedCandidate && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Candidate</Label>
                <p className="text-sm font-medium">{selectedCandidate.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedCandidate.email}</p>
                {selectedCandidate.jobs?.job_title && (
                  <p className="text-sm text-muted-foreground">
                    Position: {selectedCandidate.jobs.job_title}
                  </p>
                )}
              </div>
              {createdLink ? (
                <div className="rounded-lg border-2 border-green-500 bg-green-50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <p className="text-sm font-semibold text-green-800">Upload Link Created Successfully!</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Upload Link:</Label>
                    <div className="flex items-center gap-2 p-2 bg-white border rounded-md">
                      <Input
                        value={createdLink}
                        readOnly
                        className="flex-1 text-sm font-mono border-0 bg-transparent"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(createdLink);
                          toast({
                            title: "Link Copied!",
                            description: "Upload link has been copied to clipboard",
                          });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This link has been sent to the candidate via email. You can also copy it manually.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-muted bg-muted/40 p-4">
                  <p className="text-sm font-medium mb-2">Upload Link Format:</p>
                  <div className="p-2 bg-white border rounded-md mb-3">
                    <code className="text-xs text-muted-foreground">
                      {window.location.origin}/{"{candidate-id}"}/upload-documents
                    </code>
                  </div>
                  <p className="text-sm font-medium mb-2">Required Documents:</p>
                  <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Educational Credentials 10th to Highest</li>
                    <li>Latest resume copy. (Updated) with local address.</li>
                    <li>ID proof (Aadhar Card & PAN Card) For KYC</li>
                    <li>Professional / Course Certificates (If Any)</li>
                    <li>Previously offer letters & Relieving letters, internship certificates (If Any)</li>
                  </ul>
                  <p className="text-sm text-muted-foreground mt-3">
                    The candidate will receive an email with their unique upload link and Candidate ID.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSendEmailDialogOpen(false)}
              disabled={sendingEmail}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={sendingEmail || sendDocumentRequestMutation.isPending}
              className="bg-gradient-primary hover:opacity-90 text-primary-foreground"
            >
              {sendingEmail || sendDocumentRequestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Documents Dialog */}
      <Dialog open={isViewDocumentsDialogOpen} onOpenChange={setIsViewDocumentsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Uploaded Documents</DialogTitle>
            <DialogDescription>
              {selectedCandidate && (
                <>Documents uploaded by {selectedCandidate.full_name}</>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {loadingDocuments ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : candidateDocuments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {candidateDocuments.some((d) => d.verification_status !== "verified") && (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
                  <p className="text-sm text-muted-foreground">
                    {candidateDocuments.filter((d) => d.verification_status !== "verified").length} not verified —
                    verify all at once, or review each below.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleVerifyAllDocuments}
                    disabled={verifyingDocId !== null || rejectingDocId !== null}
                    className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                  >
                    {verifyingDocId === "all" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Verify All
                      </>
                    )}
                  </Button>
                </div>
              )}
              {candidateDocuments.map((doc) => {
                const docTypeInfo = DOCUMENT_TYPES.find(d => d.id === doc.document_type);
                const getStatusBadge = () => {
                  switch (doc.verification_status) {
                    case 'verified':
                      return <Badge className="bg-green-100 text-green-800">Verified</Badge>;
                    case 'rejected':
                      return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
                    case 'revision_requested':
                      return <Badge className="bg-yellow-100 text-yellow-800">Revision Requested</Badge>;
                    default:
                      return <Badge variant="outline">Pending</Badge>;
                  }
                };

                return (
                  <Card key={doc.id} className="border-2">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <File className="h-5 w-5 text-primary" />
                            <h4 className="font-semibold">{docTypeInfo?.label || doc.document_name}</h4>
                            {docTypeInfo?.required && (
                              <Badge variant="outline" className="text-xs">Required</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            File: {doc.file_name}
                          </p>
                          {doc.file_size && (
                            <p className="text-xs text-muted-foreground">
                              Size: {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Uploaded: {new Date(doc.uploaded_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {getStatusBadge()}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mt-4 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDocument(doc.file_url)}
                          className="flex-1 min-w-[120px]"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadDocument(doc.file_url, doc.file_name)}
                          className="flex-1 min-w-[120px]"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                      
                      {doc.verification_notes && (
                        <div className="mt-3 p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium mb-1">Verification Notes:</p>
                          <p className="text-sm text-muted-foreground">{doc.verification_notes}</p>
                        </div>
                      )}

                      {/* Verify / reject actions. A verified doc can be set back
                          (reject); a rejected doc can be re-verified. So a Verify
                          button shows for anything not yet verified, and a Reject
                          / Set-back button for anything not yet rejected. */}
                      <div className="flex gap-2 mt-4 pt-4 border-t">
                        {doc.verification_status !== 'verified' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleVerifyDocument(doc.id)}
                            disabled={verifyingDocId !== null || rejectingDocId !== null}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            {verifyingDocId === doc.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Verifying...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                {doc.verification_status === 'rejected' ? 'Re-verify' : 'Verify'}
                              </>
                            )}
                          </Button>
                        )}
                        {doc.verification_status !== 'rejected' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRejectDocument(doc.id)}
                            disabled={verifyingDocId !== null || rejectingDocId !== null}
                            className="flex-1"
                          >
                            {rejectingDocId === doc.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Rejecting...
                              </>
                            ) : (
                              <>
                                <XCircle className="h-4 w-4 mr-2" />
                                {doc.verification_status === 'verified' ? 'Set back' : 'Reject'}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsViewDocumentsDialogOpen(false);
                setSelectedCandidate(null);
                setCandidateDocuments([]);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Document Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
            <DialogDescription>
              Please provide feedback for rejecting this document. The candidate will receive an email with your feedback and a link to upload a corrected version.
            </DialogDescription>
          </DialogHeader>
          {documentToReject && selectedCandidate && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Document</Label>
                <p className="text-sm font-medium">{documentToReject.docType}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-feedback">Feedback / Reason for Rejection *</Label>
                <Textarea
                  id="reject-feedback"
                  placeholder="Please provide specific feedback about why this document is being rejected. For example: 'The document is not clear', 'Missing information', 'Wrong format', etc."
                  value={rejectFeedback}
                  onChange={(e) => setRejectFeedback(e.target.value)}
                  rows={5}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  This feedback will be sent to the candidate via email along with the upload link.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRejectDialogOpen(false);
                setDocumentToReject(null);
                setRejectFeedback("");
              }}
              disabled={rejectingDocId !== null}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReject}
              disabled={rejectingDocId !== null || !rejectFeedback.trim()}
              variant="destructive"
            >
              {rejectingDocId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject & Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


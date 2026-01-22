import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CandidateCard from "@/components/CandidateCard";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { FileText, Loader2, Download, Mail, Upload, History, ExternalLink, Search, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { openResume } from "@/lib/resume";
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

type InternshipType = "Paid" | "Unpaid";

interface OfferLetterData {
  candidateId: string;
  position: string;
  department: string;
  internshipType: InternshipType;
  salary: string;
  startDate: string;
  endDate: string;
  managerName: string;
  joiningLocation: string;
  email: string;
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

// Generate PDF content (simple HTML to PDF conversion)
const generateOfferLetterPDF = async (
  candidateName: string,
  data: OfferLetterData
): Promise<Blob> => {
  const formattedStartDate = data.startDate ? format(new Date(data.startDate), "MMMM dd, yyyy") : "To be decided";
  const formattedEndDate = data.endDate ? format(new Date(data.endDate), "MMMM dd, yyyy") : "To be decided";
  const currentDate = format(new Date(), "MMMM dd, yyyy");
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 40px auto;
          padding: 20px;
          line-height: 1.8;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header h1 {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 20px;
          text-transform: uppercase;
        }
        .content {
          margin: 30px 0;
        }
        .content p {
          margin-bottom: 15px;
          text-align: justify;
        }
        .signature-section {
          margin-top: 50px;
          margin-bottom: 50px;
        }
        .signature-line {
          margin-top: 30px;
        }
        .signature-line p {
          margin: 5px 0;
        }
        .nda-section {
          margin-top: 60px;
          page-break-before: always;
          padding-top: 40px;
        }
        .nda-section h2 {
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 20px;
          text-align: center;
          text-transform: uppercase;
        }
        .nda-section p {
          margin-bottom: 12px;
          text-align: justify;
        }
        .nda-section ol, .nda-section ul {
          margin-left: 20px;
          margin-bottom: 15px;
        }
        .nda-section li {
          margin-bottom: 8px;
        }
        .nda-section strong {
          font-weight: bold;
        }
        .signature-blank {
          margin-top: 40px;
        }
        .signature-blank p {
          margin: 8px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>INTERNSHIP OFFER LETTER</h1>
      </div>
      
      <div class="content">
        <p>Dear ${candidateName},</p>
        
        <p>We are pleased to offer you the opportunity to join Tech Vitta, as an Intern in the <strong>${data.department}</strong> department. This internship is designed to provide you with valuable hands-on learning experience and exposure to the professional environment of our organization.</p>
        
        <p>Your internship is scheduled to begin on <strong>${formattedStartDate}</strong> and will continue until <strong>${formattedEndDate}</strong>, unless extended or concluded earlier by either party with prior notice. During this period, you will report to the <strong>${data.managerName}</strong> or any other person assigned by the management.</p>
        
        <p>Please note that this is a training-oriented internship and not a full-time employment relationship. Your performance and contribution will be regularly reviewed by the manager. Based on your performance, learning progress, and the quality of work delivered, a stipend or payment may be provided as per management discretion.</p>
        
        <p>The amount, frequency, and nature of such payment will depend on the manager's assessment and organizational policies. The decision of the manager regarding performance evaluation and payment will be considered final.</p>
        
        <p>You are expected to maintain professional conduct, punctuality, and confidentiality at all times. The company reserves the right to discontinue the internship if the assigned guidelines are not followed.</p>
        
        <p>We look forward to having you as part of our team and are confident that this experience will contribute positively to your personal and professional growth.</p>
        
        <p>Please confirm your acceptance by signing below and returning a scanned copy to us.</p>
        
        <p>Best regards,</p>
        
        <div class="signature-section">
          <p>Yours Sincerely,</p>
          <p>For Techvitta innovations Pvt Ltd.</p>
          <div class="signature-line">
            <p>&nbsp;</p>
            <p>Raja Garapati</p>
            <p>Head</p>
            <p>People Success Team</p>
      </div>
        </div>
        
        <div class="signature-blank">
          <p>Accepted and agreed by:</p>
          <p>Signature: _______________________</p>
          <p>Name: ___________________________</p>
          <p>Date: ____________________________</p>
        </div>
      </div>
      
      <div class="nda-section">
        <h2>NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT</h2>
        
        <p>This Non-Disclosure and Confidentiality Agreement ("Agreement") is made and entered into as of <strong>${currentDate}</strong> by and between:</p>
        
        <p>Tech Vitta, a company with its principal place of business at plot no 19, Madhapur Hyderabad (hereinafter referred to as the "Company");</p>
        
        <p>AND</p>
        
        <p><strong>${candidateName}</strong>, residing at Hyderabad (hereinafter referred to as the "Employee/Intern").</p>
        
        <p><strong>1. Purpose</strong> The Company is engaged in various business activities, including providing services to its clients ("Clients"). In the course of the Employee/Intern's engagement with the Company, the Employee/Intern will be exposed to and will have access to certain proprietary and confidential information of the Company and its Clients. The purpose of this Agreement is to ensure the protection of such Confidential Information.</p>
        
        <p><strong>2. Definition of Confidential Information</strong> "Confidential Information" shall mean any and all information, whether written, oral, electronic, or in any other form, that is disclosed by the Company or its Clients to the Employee/Intern, or to which the Employee/Intern obtains access, related to the business of the Company and its Clients. This includes, but is not limited to:</p>
        <p>a. All non-public information related to the Company's and Clients' business, including business plans, financial data, marketing strategies, and customer lists.</p>
        <p>b. All technical information, including software, source code, data, algorithms, schematics, processes, inventions, and research.</p>
        <p>c. Any information of a third party, including clients, that the Company is under an obligation of confidentiality to protect.</p>
        
        <p><strong>3. Obligations of the Employee/Intern</strong> The Employee/Intern agrees to:</p>
        <p>a. Hold all Confidential Information in the strictest confidence and not disclose, distribute, or disseminate it to any third party without the prior written consent of the Company.</p>
        <p>b. Use the Confidential Information solely for the purpose of fulfilling the duties assigned by the Company.</p>
        <p>c. Not copy, reproduce, or store Confidential Information on any personal devices or in unauthorized locations.</p>
        <p>d. Take all reasonable measures to protect the secrecy of and avoid disclosure or use of Confidential Information.</p>
        
        <p><strong>4. Exclusions</strong> Confidential Information shall not include any information that:</p>
        <p>a. Is or becomes publicly available through no fault of the Employee/Intern.</p>
        <p>b. Was in the Employee/Intern's possession prior to its disclosure by the Company, as evidenced by written records.</p>
        <p>c. Is rightfully received by the Employee/Intern from a third party without breach of any confidentiality obligation.</p>
        <p>d. Is approved for release by prior written consent of the Company.</p>
        
        <p><strong>5. Term and Termination</strong> the Employee/Intern's obligations under this Agreement shall remain in effect for the duration of the Employee/Intern's engagement with the Company and shall survive its termination for a period of five (5) years thereafter for Company information and ten (10) years thereafter for Client-specific information. Upon termination of the engagement, the Employee/Intern must immediately return all Confidential Information and all copies thereof to the Company.</p>
        
        <p><strong>6. Remedies</strong> The Employee/Intern acknowledges that any breach of this Agreement will cause irreparable harm to the Company and its Clients, for which monetary damages may be an insufficient remedy. The Employee/Intern therefore agrees that, in the event of a breach, the Company shall be entitled to seek injunctive relief and any other remedies available at law or in equity, including recovery of damages.</p>
        
        <p><strong>7. Governing Law</strong> This Agreement shall be governed by and construed in accordance with the laws of Hyderabad.</p>
        
        <p>IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.</p>
        
        <div class="signature-blank">
          <p>For and on behalf of Tech Vitta:</p>
          <p>&nbsp;</p>
          <p>&nbsp;</p>
          <p>Employee/Intern:</p>
          <p>&nbsp;</p>
          <p>&nbsp;</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Create a blob from HTML (for now, we'll store the HTML and let user download)
  // In production, you'd use a library like jsPDF or html2pdf
  return new Blob([htmlContent], { type: "text/html" });
};

export default function OfferLetter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<OfferLetterData>({
    candidateId: "",
    position: "",
    department: "",
    internshipType: "Paid",
    salary: "",
    startDate: "",
    endDate: "",
    managerName: "",
    joiningLocation: "",
    email: "",
  });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCandidate, setUploadCandidate] = useState<Candidate | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("generate");
  const [searchTerm, setSearchTerm] = useState("");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [repliesDialogOpen, setRepliesDialogOpen] = useState(false);
  const [selectedCandidateForReplies, setSelectedCandidateForReplies] = useState<Candidate | null>(null);

  // Fetch only approved candidates with verified documents
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["approved-candidates"],
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
          jobs (
            job_title,
            department
          )
        `)
        .eq("status", "Approved")
        .eq("document_verification_status", "verified")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as Candidate[];
    },
  });

  // Fetch all offer letters history
  const { data: offerLettersHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["offer-letters-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer-letters")
        .select(`
          id,
          candidate_id,
          position,
          department,
          internship_type,
          salary,
          start_date,
          end_date,
          manager_name,
          joining_location,
          email,
          offer_letter_url,
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

  // Mark offer letter for manual upload (no auto-generation)
  const generateOfferLetterMutation = useMutation({
    mutationFn: async (data: OfferLetterData) => {
      if (!selectedCandidate) throw new Error("No candidate selected");

      const { error: offerLetterError } = await (supabase.from("offer-letters") as any).insert({
        candidate_id: data.candidateId,
        position: data.position,
        department: data.department,
        internship_type: data.internshipType,
        salary: data.salary || null,
        start_date: data.startDate,
        end_date: data.endDate,
        manager_name: data.managerName,
        joining_location: data.joiningLocation,
        email: data.email,
        offer_letter_url: null,
      });

      if (offerLetterError) throw offerLetterError;

      const { error: statusError } = await supabase
        .from("candidates")
        .update({ status: "Offer Released" })
        .eq("id", data.candidateId);

      if (statusError) throw statusError;

      const details = `Offer letter marked for manual handling for ${selectedCandidate.full_name}. Position: ${data.position}, Department: ${data.department}, Internship Type: ${data.internshipType}, Start Date: ${data.startDate}, End Date: ${data.endDate}, Manager: ${data.managerName}, Location: ${data.joiningLocation}, Compensation: ${data.salary || "N/A"}.`;

      const { error: logError } = await supabase.from("activity_logs").insert({
        action: "OFFER_LETTER_MANUAL_READY",
        details,
      });

      if (logError) throw logError;
    },
    onSuccess: () => {
      toast({
        title: "Candidate moved to history",
        description: "Manual upload pending. Use the Upload Offer Letter button when ready.",
      });

      setIsDialogOpen(false);
      setSelectedCandidate(null);
      setFormData({
        candidateId: "",
        position: "",
        department: "",
        internshipType: "Paid",
        salary: "",
        startDate: "",
        endDate: "",
        managerName: "",
        joiningLocation: "",
        email: "",
      });

      queryClient.invalidateQueries({ queryKey: ["approved-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["offer-letters-history"] });
      queryClient.invalidateQueries({ queryKey: ["approved-count"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update history",
        variant: "destructive",
      });
    },
  });

  // Upload offer letter mutation
  const uploadOfferLetterMutation = useMutation({
    mutationFn: async ({ file, candidate, email }: { file: File; candidate: Candidate; email: string }) => {
      setUploadingFile(true);
      
      // 1. Upload file to Supabase storage
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const storageFileName = `manual-upload-${candidate.id}-${timestamp}-${sanitizedFileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("offer-letters")
        .upload(storageFileName, file, {
          contentType: file.type || "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 2. Get public URL
      const { data: urlData } = supabase.storage
        .from("offer-letters")
        .getPublicUrl(uploadData.path);
      
      const offerLetterUrl = urlData.publicUrl;

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
        .eq("action", "OFFER_LETTER_EMAIL_SENT")
        .ilike("details", `%${email}%`)
        .limit(1);

      if (historyError) {
        console.error("Failed to check offer letter email history:", historyError);
      }

      if (!existingLogs || existingLogs.length === 0) {
      const { data: emailData, error: emailError } = await supabase.functions.invoke("send-email", {
        body: {
          to: email,
          candidateName: candidate.full_name,
          emailType: "offer-letter-upload",
          data: {
            positionTitle: candidate.jobs?.job_title || "Intern",
            attachment: {
              filename: file.name,
              content: fileBase64,
              type: file.type || "application/pdf",
            },
            offer_letter_url: offerLetterUrl,
          },
        },
      });

      if (emailError || !emailData?.success) {
        console.warn("Email sending failed, but file uploaded:", emailError || emailData?.error);
        // Don't throw - file is uploaded successfully
        } else {
          emailSent = true;
          await supabase.from("activity_logs").insert({
            action: "OFFER_LETTER_EMAIL_SENT",
            details: `Offer letter email sent to ${candidate.full_name} (${email})`,
          });
        }
      }

      // 5. Save to database
      const { error: dbError } = await supabase.from("offer-letters").insert({
        candidate_id: candidate.id,
        position: candidate.jobs?.job_title || "Intern",
        department: candidate.jobs?.department || "IT",
        internship_type: "Paid",
        salary: null,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        manager_name: "HR Manager",
        joining_location: "Hyderabad",
        email: email,
        offer_letter_url: offerLetterUrl,
      });

      if (dbError) throw dbError;

      // 6. Update candidate status
      await supabase
        .from("candidates")
        .update({ status: "Offer Released" })
        .eq("id", candidate.id);

      // 7. Log activity
      await supabase.from("activity_logs").insert({
        action: "OFFER_LETTER_UPLOADED",
        details: `Manual offer letter uploaded for ${candidate.full_name}. File: ${file.name}`,
      });

      return { offerLetterUrl, emailSent };
    },
    onSuccess: (result, variables) => {
      toast({
        title: "Offer Letter Uploaded",
        description: result.emailSent 
          ? `Offer letter uploaded and email sent to ${variables.email}`
          : `Offer letter uploaded. Email ${result.emailSent ? 'sent' : 'failed to send'}`,
      });
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadCandidate(null);
      setUploadingFile(false);
      queryClient.invalidateQueries({ queryKey: ["approved-candidates"] });
    },
    onError: (error: any) => {
      setUploadingFile(false);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload offer letter",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setFormData({
      candidateId: candidate.id,
      position: candidate.jobs?.job_title || "",
      department: candidate.jobs?.department || "",
      internshipType: "Paid",
      salary: "",
      startDate: "",
      endDate: "",
      managerName: "",
      joiningLocation: "",
      email: candidate.email,
    });
    setIsDialogOpen(true);
  };

  const handleFileSelect = (candidate: Candidate) => {
    setUploadCandidate(candidate);
    setIsUploadDialogOpen(true);
  };

  // Fetch email replies for offer-letter stage
  const { data: emailReplies = [] } = useQuery({
    queryKey: ["email-replies-offer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_replies")
        .select("*")
        .eq("email_stage", "offer-letter")
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

    uploadOfferLetterMutation.mutate({ 
      file: selectedFile, 
      candidate: uploadCandidate,
      email: email,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isPaidInternship = formData.internshipType === "Paid";
    if (
      !formData.position ||
      !formData.department ||
      !formData.startDate ||
      !formData.endDate ||
      !formData.managerName ||
      !formData.joiningLocation ||
      !formData.email ||
      (isPaidInternship && !formData.salary)
    ) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    generateOfferLetterMutation.mutate(formData);
  };

  const handleViewResume = async (resumeUrl: string) => {
    await openResume(resumeUrl);
  };

  const handleViewOfferLetter = async (offerLetterUrl: string) => {
    try {
      if (!offerLetterUrl) {
        toast({
          title: "Error",
          description: "Offer letter URL is not available",
          variant: "destructive",
        });
        return;
      }

      // Check if it's already a full URL (http/https)
      if (offerLetterUrl.startsWith('http://') || offerLetterUrl.startsWith('https://')) {
        // Check if it's a Supabase storage public URL
        // Format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
        const supabaseStorageMatch = offerLetterUrl.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
        
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
        window.open(offerLetterUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      // If it's a storage path (not a full URL), extract bucket and path
      let bucket = 'offer-letters';
      let path = offerLetterUrl;

      // Handle different path formats
      if (offerLetterUrl.includes('/')) {
        const parts = offerLetterUrl.split('/');
        // Check if first part is a bucket name
        if (parts[0] === 'offer-letters' || parts[0] === 'experience-letters') {
          bucket = parts[0];
          path = parts.slice(1).join('/');
        } else {
          // Assume it's just a path in offer-letters bucket
          bucket = 'offer-letters';
          path = offerLetterUrl;
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
          description: error.message || "Could not open offer letter. The file may not exist or the bucket may not be accessible.",
          variant: "destructive",
        });
        return;
      }

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      console.error('Error viewing offer letter:', err);
      toast({
        title: "Error",
        description: err.message || "Could not open offer letter",
        variant: "destructive",
      });
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
      const jobMatch = candidate.jobs?.job_title?.toLowerCase().includes(searchLower);
      return nameMatch || emailMatch || phoneMatch || jobMatch;
    });
  }, [candidates, searchTerm]);

  // Filter offer letters history based on search term
  const filteredOfferLettersHistory = useMemo(() => {
    if (!historySearchTerm.trim()) {
      return offerLettersHistory;
    }
    
    const searchLower = historySearchTerm.toLowerCase();
    return offerLettersHistory.filter((offer: any) => {
      const nameMatch = offer.candidates?.full_name?.toLowerCase().includes(searchLower);
      const emailMatch = offer.email?.toLowerCase().includes(searchLower);
      const positionMatch = offer.position?.toLowerCase().includes(searchLower);
      const departmentMatch = offer.department?.toLowerCase().includes(searchLower);
      const managerMatch = offer.manager_name?.toLowerCase().includes(searchLower);
      const locationMatch = offer.joining_location?.toLowerCase().includes(searchLower);
      const typeMatch = offer.internship_type?.toLowerCase().includes(searchLower);
      return nameMatch || emailMatch || positionMatch || departmentMatch || managerMatch || locationMatch || typeMatch;
    });
  }, [offerLettersHistory, historySearchTerm]);

  // Determine which columns to show based on actual data
  const visibleColumns = useMemo(() => {
    if (filteredOfferLettersHistory.length === 0) {
      // Show all columns if no data
      return {
        candidateName: true,
        email: true,
        position: true,
        department: true,
        type: true,
        startDate: true,
        endDate: true,
        manager: true,
        location: true,
        salary: true,
        issuedDate: true,
        document: true,
      };
    }

    // Check which columns have at least one non-empty value
    const hasData = {
      candidateName: filteredOfferLettersHistory.some((offer: any) => offer.candidates?.full_name),
      email: filteredOfferLettersHistory.some((offer: any) => offer.email),
      position: filteredOfferLettersHistory.some((offer: any) => offer.position),
      department: filteredOfferLettersHistory.some((offer: any) => offer.department),
      type: filteredOfferLettersHistory.some((offer: any) => offer.internship_type),
      startDate: filteredOfferLettersHistory.some((offer: any) => offer.start_date),
      endDate: filteredOfferLettersHistory.some((offer: any) => offer.end_date),
      manager: filteredOfferLettersHistory.some((offer: any) => offer.manager_name),
      location: filteredOfferLettersHistory.some((offer: any) => offer.joining_location),
      salary: filteredOfferLettersHistory.some((offer: any) => 
        offer.salary && offer.salary.toString().trim().length > 0
      ),
      issuedDate: filteredOfferLettersHistory.some((offer: any) => offer.created_at),
      document: filteredOfferLettersHistory.some((offer: any) => offer.offer_letter_url),
    };

    return hasData;
  }, [filteredOfferLettersHistory]);

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
        <h1 className="text-3xl font-bold text-foreground">Offer Letter</h1>
        <p className="text-muted-foreground mt-1">
          Generate and manage offer letters for approved candidates
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Generate Offer Letter
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History ({offerLettersHistory.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6 mt-6">
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

      <div className="grid gap-6">
        {filteredCandidates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{searchTerm ? "No candidates found matching your search." : "No approved candidates found. Approve candidates first to generate offer letters."}</p>
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
                  {candidate.feedback_submitted_at && (
                    <p className="text-xs text-muted-foreground">
                      Submitted on {new Date(candidate.feedback_submitted_at).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
              <Dialog open={isDialogOpen && selectedCandidate?.id === candidate.id} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => handleOpenDialog(candidate)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Generate Offer Letter
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  {/* <DialogHeader>
                    <DialogTitle>Generate Digital Offer Letter</DialogTitle>
                    <DialogDescription>
                      Fill in the details to generate an offer letter for {candidate.full_name}
                    </DialogDescription>
                  </DialogHeader> */}
                  <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {/* <div>
                      <Label>Candidate Name</Label>
                      <Input
                        value={candidate.full_name}
                        disabled
                        className="bg-muted"
                      />
                    </div>

                    <div>
                      <Label>Position *</Label>
                      <Input
                        value={formData.position}
                        onChange={(e) =>
                          setFormData({ ...formData, position: e.target.value })
                        }
                        placeholder="e.g., Software Engineer Intern"
                        required
                      />
                    </div>

                    <div>
                      <Label>Department *</Label>
                      <Input
                        value={formData.department}
                        onChange={(e) =>
                          setFormData({ ...formData, department: e.target.value })
                        }
                        placeholder="e.g., Engineering"
                        required
                      />
                    </div>

                    <div>
                      <Label>Internship Type *</Label>
                      <Select
                        value={formData.internshipType}
                        onValueChange={(value: InternshipType) =>
                          setFormData({ ...formData, internshipType: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Paid">Paid</SelectItem>
                          <SelectItem value="Unpaid">Unpaid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Salary / Stipend {formData.internshipType === "Paid" ? "*" : "(optional)"}</Label>
                      <Input
                        type="text"
                        value={formData.salary}
                        onChange={(e) =>
                          setFormData({ ...formData, salary: e.target.value })
                        }
                        placeholder={formData.internshipType === "Paid" ? "e.g., ₹15,000 per month" : "Not applicable"}
                        required={formData.internshipType === "Paid"}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Start Date *</Label>
                        <Input
                          type="date"
                          value={formData.startDate}
                          onChange={(e) =>
                            setFormData({ ...formData, startDate: e.target.value })
                          }
                          min={format(new Date(), "yyyy-MM-dd")}
                          required
                        />
                      </div>
                      <div>
                        <Label>End Date *</Label>
                        <Input
                          type="date"
                          value={formData.endDate}
                          onChange={(e) =>
                            setFormData({ ...formData, endDate: e.target.value })
                          }
                          min={formData.startDate || format(new Date(), "yyyy-MM-dd")}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Reporting Manager *</Label>
                      <Input
                        value={formData.managerName}
                        onChange={(e) =>
                          setFormData({ ...formData, managerName: e.target.value })
                        }
                        placeholder="e.g., Priya Sharma"
                        required
                      />
                    </div>

                    <div>
                      <Label>Joining Location *</Label>
                      <Input
                        value={formData.joiningLocation}
                        onChange={(e) =>
                          setFormData({ ...formData, joiningLocation: e.target.value })
                        }
                        placeholder="e.g., Hyderabad Office / Remote"
                        required
                      />
                    </div>

                    <div>
                      <Label>Offer Letter Email *</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="Enter candidate email"
                        required
                      />
                    </div> */}

                    <div className="flex flex-col justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsDialogOpen(false);
                          handleFileSelect(candidate);
                        }}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Offer Letter
                      </Button>
                    {/* <div className="flex justify-between p-4">  <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={generateOfferLetterMutation.isPending}
                      >
                        {generateOfferLetterMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Moving to history...
                          </>
                        ) : (
                          <>
                            <Mail className="mr-2 h-4 w-4" />
                            Mark as Generated
                          </>
                        )}
                      </Button></div> */}
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </CandidateCard>
          ))
        )}
      </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
      {/* Offer Letter History Section */}
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <History className="h-5 w-5" />
                Offer Letter History
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Complete history of all issued offer letters
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
                placeholder="Search by name, email, or phone"
                className="pl-9"
              />
            </div>
          </div>

          {isHistoryLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredOfferLettersHistory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{historySearchTerm ? "No offer letters found matching your search." : "No offer letters have been issued yet."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Document</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOfferLettersHistory.map((offer: any) => (
                    <TableRow key={offer.id}>
                      <TableCell className="font-medium">
                        {offer.candidates?.full_name || "N/A"}
                      </TableCell>
                      <TableCell>{offer.email || "N/A"}</TableCell>
                      <TableCell>{offer.candidates?.phone || "N/A"}</TableCell>
                      <TableCell>
                        {offer.offer_letter_url ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewOfferLetter(offer.offer_letter_url)}
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

      {/* Upload Offer Letter Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Offer Letter</DialogTitle>
            <DialogDescription>
              Upload a manually created offer letter for {uploadCandidate?.full_name}
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
              <Label>Offer Letter File (PDF/HTML/DOC) *</Label>
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
                disabled={uploadOfferLetterMutation.isPending || !selectedFile}
              >
                {uploadOfferLetterMutation.isPending ? (
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

      {/* Email Replies Dialog */}
      <Dialog open={repliesDialogOpen} onOpenChange={setRepliesDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Replies from {selectedCandidateForReplies?.full_name || "Candidate"}</DialogTitle>
            <DialogDescription>
              Email replies received for offer letter stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedCandidateForReplies && getCandidateReplies(selectedCandidateForReplies).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No email replies received yet from this candidate for offer letter stage.</p>
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


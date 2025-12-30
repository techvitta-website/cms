import { useMemo, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle, FileText, Loader2, AlertCircle, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

type DocumentTypeId =
  | "educational_credentials"
  | "resume_copy"
  | "id_proof"
  | "professional_certificates"
  | "previous_employment";

type DocumentConfig =
  | {
    id: Exclude<DocumentTypeId, "id_proof">;
    label: string;
    required: boolean;
    allowMultiple: boolean;
    helperText?: string;
  }
  | {
    id: "id_proof";
    label: string;
    required: boolean;
    fields: Array<{
      key: "aadhar" | "pan";
      label: string;
      required: boolean;
    }>;
    helperText?: string;
  };

// Document types matching the requirements
const DOCUMENT_TYPES: DocumentConfig[] = [
  {
    id: "educational_credentials",
    label: "Educational Credentials 10th to Highest",
    required: true,
    allowMultiple: true,
    helperText: "Upload 10th, 12th/Diploma, Degree, and any other mark sheets/certificates you have.",
  },
  {
    id: "resume_copy",
    label: "Latest resume copy. (Updated) with local address.",
    required: true,
    allowMultiple: false,
  },
  {
    id: "id_proof",
    label: "ID proof (Aadhar Card & PAN Card) For KYC",
    required: true,
    fields: [
      { key: "aadhar", label: "Aadhar Card", required: true },
      { key: "pan", label: "PAN Card", required: true },
    ],
  },
  {
    id: "professional_certificates",
    label: "Professional / Course Certificates (If Any)",
    required: false,
    allowMultiple: true,
  },
  {
    id: "previous_employment",
    label: "Previously offer letters & Relieving letters, internship certificates (If Any)",
    required: false,
    allowMultiple: true,
  },
];

const ACCEPTED_FILE_TYPES = ".pdf";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface CandidateData {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_id: string | null;
  jobs?: {
    job_title: string;
  } | null;
}

interface UploadedDoc {
  fileName: string;
  uploadedAt: string;
  subType?: string; // for aadhar/pan under id_proof
}

export default function UploadDocuments() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [candidateData, setCandidateData] = useState<CandidateData | null>(null);
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [uploadedDocs, setUploadedDocs] = useState<{ [key: string]: UploadedDoc[] }>({});
  const [files, setFiles] = useState<{ [key: string]: File[] }>({});

  useEffect(() => {
    if (id) {
      loadCandidateData();
    } else {
      setLoading(false);
    }
  }, [id]);

  const loadCandidateData = async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("candidates")
        .select(`
          id,
          full_name,
          email,
          phone,
          job_id,
          jobs (
            job_title
          )
        `)
        .eq("id", id)
        .single();

      if (error || !data) {
        toast({
          title: "Error",
          description: "Candidate not found. Please check the link.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      setCandidateData(data as CandidateData);

      // Load already uploaded documents
      loadUploadedDocuments(id);
    } catch (error) {
      console.error("Error loading candidate data:", error);
      toast({
        title: "Error",
        description: "Failed to load candidate information.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUploadedDocuments = async (candidateId: string) => {
    try {
      const { data } = await supabase
        .from("candidate_documents")
        .select("document_type, file_name, uploaded_at, document_name")
        .eq("candidate_id", candidateId)
        .order("uploaded_at", { ascending: false });

      if (data) {
        const uploaded: { [key: string]: UploadedDoc[] } = {};
        data.forEach((doc) => {
          const docType = doc.document_type;
          if (!uploaded[docType]) {
            uploaded[docType] = [];
          }

          // Check if it's an aadhar/pan subtype (stored in document_name)
          let subType: string | undefined;
          if (docType === "id_proof") {
            if (doc.document_name?.toLowerCase().includes("aadhar")) {
              subType = "aadhar";
            } else if (doc.document_name?.toLowerCase().includes("pan")) {
              subType = "pan";
            }
          }

          uploaded[docType].push({
            fileName: doc.file_name,
            uploadedAt: doc.uploaded_at,
            subType,
          });
        });
        setUploadedDocs(uploaded);
      }
    } catch (error) {
      console.error("Error loading uploaded documents:", error);
    }
  };

  const handleFileSelect = (docType: string, newFiles: FileList | null, subKey?: string) => {
    if (!newFiles || newFiles.length === 0) return;

    const filesArray = Array.from(newFiles);

    // Check if all files are PDFs
    const nonPdfFiles = filesArray.filter(
      (file) => !file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')
    );

    if (nonPdfFiles.length > 0) {
      toast({
        title: "Invalid File Format",
        description: `Only PDF files are allowed. Please convert "${nonPdfFiles[0].name}" to PDF format.`,
        variant: "destructive",
      });
      return;
    }

    const validFiles = filesArray.filter((file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10 MB limit`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const key = subKey ? `${docType}_${subKey}` : docType;
    const docConfig = DOCUMENT_TYPES.find((d) => d.id === docType);

    if (
      docConfig &&
      "allowMultiple" in docConfig &&
      !docConfig.allowMultiple &&
      validFiles.length > 1
    ) {
      toast({
        title: "Multiple files not allowed",
        description: `Only one file allowed for ${docConfig.label}`,
        variant: "destructive",
      });
      setFiles((prev) => ({ ...prev, [key]: [validFiles[0]] }));
    } else {
      setFiles((prev) => ({ ...prev, [key]: validFiles }));
    }
  };

  const handleUpload = async (docType: string, subKey?: string) => {
    const key = subKey ? `${docType}_${subKey}` : docType;
    const filesToUpload = files[key];

    if (!filesToUpload || filesToUpload.length === 0 || !id || !candidateData) return;

    setUploading((prev) => ({ ...prev, [key]: true }));

    try {
      // Sanitize candidate name for folder name (remove special characters, replace spaces with underscores)
      const sanitizedCandidateName = candidateData.full_name
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .trim();

      for (const file of filesToUpload) {
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const timestamp = Date.now();
        const storagePath = `${sanitizedCandidateName}/${docType}_${subKey || ""}${timestamp}_${sanitizedFileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("candidate-documents")
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Determine document name (include subKey label for aadhar/pan)
        let documentName = DOCUMENT_TYPES.find((d) => d.id === docType)?.label || docType;
        if (subKey) {
          const idProofConfig = DOCUMENT_TYPES.find((d) => d.id === "id_proof");
          if (idProofConfig && "fields" in idProofConfig) {
            const field = idProofConfig.fields.find((f) => f.key === subKey);
            if (field) {
              documentName = field.label;
            }
          }
        }

        // Check if this is the first document BEFORE inserting
        const { data: existingDocs } = await supabase
          .from("candidate_documents")
          .select("id")
          .eq("candidate_id", id)
          .limit(1);

        const isFirstDocument = !existingDocs || existingDocs.length === 0;

        // Save document record
        const { error: dbError } = await supabase.from("candidate_documents").insert({
          candidate_id: id,
          document_type: docType,
          document_name: documentName,
          file_url: `candidate-documents/${storagePath}`,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          verification_status: "pending",
        });

        if (dbError) throw dbError;

        // Update candidate status to 'submitted' when first document is uploaded
        if (isFirstDocument) {
          await supabase
            .from("candidates")
            .update({ document_verification_status: "submitted" })
            .eq("id", id);
        }
      }

      // Reload uploaded documents to get updated list
      await loadUploadedDocuments(id);

      toast({
        title: "Documents Uploaded",
        description: `${filesToUpload.length} file(s) uploaded successfully`,
      });

      setFiles((prev) => ({ ...prev, [key]: [] }));
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Calculate required upload completion
  const requiredCompletion = useMemo(() => {
    const required = DOCUMENT_TYPES.filter((d) => d.required);
    const completed: string[] = [];
    const missing: string[] = [];

    required.forEach((docType) => {
      if (docType.id === "id_proof" && "fields" in docType) {
        // Check aadhar and pan separately
        const aadharUploaded = uploadedDocs["id_proof"]?.some((d) => d.subType === "aadhar");
        const panUploaded = uploadedDocs["id_proof"]?.some((d) => d.subType === "pan");

        if (aadharUploaded) {
          completed.push("Aadhar Card");
        } else {
          missing.push("Aadhar Card");
        }

        if (panUploaded) {
          completed.push("PAN Card");
        } else {
          missing.push("PAN Card");
        }
      } else {
        const uploaded = uploadedDocs[docType.id];
        if (uploaded && uploaded.length > 0) {
          completed.push(docType.label);
        } else {
          missing.push(docType.label);
        }
      }
    });

    return { completed, missing, allCompleted: missing.length === 0 };
  }, [uploadedDocs]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!candidateData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Invalid Link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This document upload link is invalid. Please check the URL or contact HR.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Confirmation screen
  if (!detailsConfirmed) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto space-y-6 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-6 w-6 text-primary" />
                Confirm Your Details
              </CardTitle>
              <CardDescription>
                Please verify your information before uploading documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please confirm that the details below are correct before proceeding to upload your documents.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">

                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Full Name</Label>
                    <div className="p-3 bg-muted rounded-md font-semibold">
                      {candidateData.full_name}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Email</Label>
                    <div className="p-3 bg-muted rounded-md">
                      {candidateData.email}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Phone</Label>
                    <div className="p-3 bg-muted rounded-md">
                      {candidateData.phone || "Not provided"}
                    </div>
                  </div>

                  {candidateData.jobs?.job_title && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Applied Position</Label>
                      <div className="p-3 bg-muted rounded-md font-medium">
                        {candidateData.jobs.job_title}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => setDetailsConfirmed(true)}
                  className="flex-1 bg-gradient-primary hover:opacity-90 text-primary-foreground"
                  size="lg"
                >
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Confirm & Proceed to Upload
                </Button>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                If any details are incorrect, please contact HR immediately.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Upload documents screen
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Document Upload Portal</CardTitle>
            <p className="text-muted-foreground mt-2">
              Welcome, <span className="font-semibold">{candidateData.full_name}</span>
            </p>
            {candidateData.jobs?.job_title && (
              <p className="text-sm text-muted-foreground">
                Position: {candidateData.jobs.job_title}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Required documents completion status */}
            <Alert variant={requiredCompletion.allCompleted ? "default" : "destructive"}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {requiredCompletion.allCompleted ? (
                  <span className="font-semibold text-green-700">
                    ✓ All required documents uploaded!
                  </span>
                ) : (
                  <>
                    <strong>Required documents pending:</strong>
                    <br />
                    Missing: {requiredCompletion.missing.join(", ")}
                  </>
                )}
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Required Documents</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Please upload the following documents. Ensure all documents are clear, legible,
                  and in PDF format only.
                </p>
              </div>

              {DOCUMENT_TYPES.map((docType) => {
                // Handle ID proof separately (aadhar + pan)
                if (docType.id === "id_proof" && "fields" in docType) {
                  return (
                    <Card key={docType.id} className="border-2">
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <Label className="font-medium text-base flex items-center gap-2">
                              {docType.label}
                              {docType.required && (
                                <span className="text-destructive text-sm">*</span>
                              )}
                            </Label>
                          </div>
                        </div>

                        {docType.fields.map((field) => {
                          const key = `${docType.id}_${field.key}`;
                          const uploaded = uploadedDocs[docType.id]?.filter(
                            (d) => d.subType === field.key
                          );

                          return (
                            <div key={field.key} className="space-y-3 pl-4 border-l-2">
                              <Label className="font-medium flex items-center gap-2">
                                {field.label}
                                {field.required && (
                                  <span className="text-destructive text-sm">*</span>
                                )}
                              </Label>

                              {uploaded && uploaded.length > 0 && (
                                <div className="space-y-2">
                                  {uploaded.map((doc, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-2 text-sm text-green-600"
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                      <span>Uploaded: {doc.fileName}</span>
                                      <span className="text-muted-foreground">
                                        ({new Date(doc.uploadedAt).toLocaleString()})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex gap-2">
                                <Input
                                  type="file"
                                  accept={ACCEPTED_FILE_TYPES}
                                  onChange={(e) =>
                                    handleFileSelect(docType.id, e.target.files, field.key)
                                  }
                                  disabled={uploading[key]}
                                  className="flex-1"
                                />
                                <Button
                                  onClick={() => handleUpload(docType.id, field.key)}
                                  disabled={!files[key] || files[key].length === 0 || uploading[key]}
                                  className="bg-gradient-primary hover:opacity-90 text-primary-foreground"
                                >
                                  {uploading[key] ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="h-4 w-4 mr-2" />
                                      Upload
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          );
                        })}

                        <p className="text-xs text-muted-foreground">
                          Maximum file size: 10 MB. Only PDF format is accepted.
                        </p>
                      </CardContent>
                    </Card>
                  );
                }

                // Handle other document types
                const uploaded = uploadedDocs[docType.id];
                const allowMultiple = "allowMultiple" in docType && docType.allowMultiple;

                return (
                  <Card key={docType.id} className="border-2">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <Label className="font-medium text-base flex items-center gap-2">
                            {docType.label}
                            {docType.required && (
                              <span className="text-destructive text-sm">*</span>
                            )}
                          </Label>
                          {docType.helperText && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {docType.helperText}
                            </p>
                          )}
                          {uploaded && uploaded.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {uploaded.map((doc, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 text-sm text-green-600"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                  <span>Uploaded: {doc.fileName}</span>
                                  <span className="text-muted-foreground">
                                    ({new Date(doc.uploadedAt).toLocaleString()})
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="file"
                          accept={ACCEPTED_FILE_TYPES}
                          multiple={allowMultiple}
                          onChange={(e) => handleFileSelect(docType.id, e.target.files)}
                          disabled={uploading[docType.id]}
                          className="flex-1"
                        />
                        <Button
                          onClick={() => handleUpload(docType.id)}
                          disabled={
                            !files[docType.id] ||
                            files[docType.id].length === 0 ||
                            uploading[docType.id]
                          }
                          className="bg-gradient-primary hover:opacity-90 text-primary-foreground"
                        >
                          {uploading[docType.id] ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Maximum file size: 10 MB per file. Only PDF format is accepted.
                        {allowMultiple && " Multiple PDF files allowed."}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> All documents will be reviewed by HR. You will be notified
                once the verification is complete.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

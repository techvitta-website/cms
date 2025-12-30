import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle, XCircle, FileText, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Document types matching the email template
const DOCUMENT_TYPES = [
  { id: 'educational_credentials', label: 'Educational Credentials 10th to Highest', required: true },
  { id: 'resume_copy', label: 'Latest resume copy. (Updated) with local address.', required: true },
  { id: 'id_proof', label: 'ID proof (Aadhar Card & PAN Card) For KYC', required: true },
  { id: 'professional_certificates', label: 'Professional / Course Certificates (If Any)', required: false },
  { id: 'previous_employment', label: 'Previously offer letters & Relieving letters, internship certificates (If Any)', required: false },
];

interface UploadTokenData {
  id: string;
  candidate_id: string;
  token: string;
  expires_at: string;
  upload_deadline: string;
  status: string;
  candidates: {
    full_name: string;
    email: string;
    jobs: {
      job_title: string;
    } | null;
  } | null;
}

export default function UploadDocuments() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenData, setTokenData] = useState<UploadTokenData | null>(null);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [uploadedDocs, setUploadedDocs] = useState<{ [key: string]: { fileName: string; uploadedAt: string } }>({});
  const [files, setFiles] = useState<{ [key: string]: File | null }>({});

  useEffect(() => {
    if (token) {
      validateToken();
    } else {
      setLoading(false);
      setTokenValid(false);
    }
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      setTokenValid(false);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('document_upload_tokens')
        .select(`
          *,
          candidates (
            id,
            full_name,
            email,
            jobs (
              job_title
            )
          )
        `)
        .eq('token', token)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        setTokenValid(false);
        setLoading(false);
        return;
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        setTokenValid(false);
        setLoading(false);
        return;
      }

      // Mark as used if not already
      if (!data.used_at) {
        await supabase
          .from('document_upload_tokens')
          .update({ used_at: new Date().toISOString() })
          .eq('id', data.id);
      }

      setTokenData(data as UploadTokenData);
      setTokenValid(true);

      // Load already uploaded documents
      if (data.candidate_id) {
        loadUploadedDocuments(data.candidate_id);
      }
    } catch (error) {
      console.error('Token validation error:', error);
      setTokenValid(false);
    } finally {
      setLoading(false);
    }
  };

  const loadUploadedDocuments = async (candidateId: string) => {
    try {
      const { data } = await supabase
        .from('candidate_documents')
        .select('document_type, file_name, uploaded_at')
        .eq('candidate_id', candidateId);

      if (data) {
        const uploaded: { [key: string]: { fileName: string; uploadedAt: string } } = {};
        data.forEach(doc => {
          uploaded[doc.document_type] = {
            fileName: doc.file_name,
            uploadedAt: doc.uploaded_at,
          };
        });
        setUploadedDocs(uploaded);
      }
    } catch (error) {
      console.error('Error loading uploaded documents:', error);
    }
  };

  const handleFileSelect = (docType: string, file: File | null) => {
    setFiles(prev => ({ ...prev, [docType]: file }));
  };

  const handleUpload = async (docType: string) => {
    const file = files[docType];
    if (!file || !token || !tokenData) return;

    setUploading(prev => ({ ...prev, [docType]: true }));

    try {
      const candidateId = tokenData.candidate_id;
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const timestamp = Date.now();
      const storagePath = `${token}/${docType}_${timestamp}_${sanitizedFileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('candidate-documents')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Check if this is the first document BEFORE inserting
      const { data: existingDocs } = await supabase
        .from('candidate_documents')
        .select('id')
        .eq('candidate_id', candidateId)
        .limit(1);
      
      const isFirstDocument = !existingDocs || existingDocs.length === 0;

      // Save document record
      const { error: dbError } = await supabase
        .from('candidate_documents')
        .insert({
          candidate_id: candidateId,
          upload_token_id: tokenData.id,
          document_type: docType,
          document_name: DOCUMENT_TYPES.find(d => d.id === docType)?.label || docType,
          file_url: `candidate-documents/${storagePath}`,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          verification_status: 'pending',
        });

      if (dbError) throw dbError;

      // Update candidate status to 'submitted' when first document is uploaded
      if (isFirstDocument) {
        await supabase
          .from('candidates')
          .update({ document_verification_status: 'submitted' })
          .eq('id', candidateId);
      }

      // Reload uploaded documents to get updated list
      await loadUploadedDocuments(candidateId);
      
      toast({
        title: "Document Uploaded",
        description: `${file.name} uploaded successfully`,
      });

      setFiles(prev => ({ ...prev, [docType]: null }));
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }));
    }
  };

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

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Invalid or Expired Link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This document upload link is invalid or has expired. 
              Please contact HR for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const deadline = tokenData?.upload_deadline 
    ? new Date(tokenData.upload_deadline).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "7 days from today";

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Document Upload Portal</CardTitle>
            <p className="text-muted-foreground mt-2">
              Welcome, <span className="font-semibold">{tokenData?.candidates?.full_name}</span>
            </p>
            {tokenData?.candidates?.jobs?.job_title && (
              <p className="text-sm text-muted-foreground">
                Position: {tokenData.candidates.jobs.job_title}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Deadline:</strong> {deadline}
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Required Documents</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Please upload the following documents. Ensure all documents are clear, legible, and in PDF or JPG format.
                </p>
              </div>

              {DOCUMENT_TYPES.map((docType) => (
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
                        {uploadedDocs[docType.id] && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span>Uploaded: {uploadedDocs[docType.id].fileName}</span>
                            <span className="text-muted-foreground">
                              ({new Date(uploadedDocs[docType.id].uploadedAt).toLocaleString()})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileSelect(docType.id, e.target.files?.[0] || null)}
                        disabled={uploading[docType.id]}
                        className="flex-1"
                      />
                      <Button
                        onClick={() => handleUpload(docType.id)}
                        disabled={!files[docType.id] || uploading[docType.id]}
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
                      Maximum file size: 10 MB. Accepted formats: PDF, JPG, PNG
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> All documents will be reviewed by HR. You will be notified once the verification is complete.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


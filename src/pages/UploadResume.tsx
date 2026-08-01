import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, CheckCircle2, AlertCircle, Loader2, FileText } from "lucide-react";

// Public page (no login): a candidate opens the link from the "request resume"
// email and uploads their resume PDF. The file lands in resumes-private and is
// attached to their candidate record, so it appears in the CMS immediately.
export default function UploadResume() {
  const { id } = useParams<{ id: string }>();
  const [candidate, setCandidate] = useState<{ full_name: string; resume_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!id || !uuidRegex.test(id)) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from("candidates")
        .select("full_name, resume_url")
        .eq("id", id)
        .maybeSingle();
      if (err || !data) setNotFound(true);
      else setCandidate(data);
      setLoading(false);
    };
    void load();
  }, [id]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!file || !id) {
      setError("Please choose your resume PDF first.");
      return;
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("The file is too large (max 10 MB).");
      return;
    }

    setUploading(true);
    try {
      // Same naming convention as HR uploads so all matching logic applies.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${Date.now()}_0_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("resumes-private")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("candidates")
        .update({ resume_url: `resumes-private/${path}`, resume_processed: false })
        .eq("id", id);
      if (updErr) throw updErr;

      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Upload className="h-6 w-6 text-primary" />
            Resume Upload
          </CardTitle>
          <CardDescription>TechVitta Innovations Pvt Ltd — Recruitment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : notFound ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This upload link is invalid or has expired. Please contact HR at hr@techvitta.in.
              </AlertDescription>
            </Alert>
          ) : done ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
              <p className="text-lg font-semibold">Resume received — thank you!</p>
              <p className="text-sm text-muted-foreground">
                Your resume has been attached to your application. Our HR team will be in touch.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm">
                Hi <span className="font-semibold">{candidate?.full_name}</span>, please upload your
                latest resume as a PDF. It will be attached to your application automatically.
              </p>
              {candidate?.resume_url && (
                <Alert>
                  <FileText className="h-4 w-4" />
                  <AlertDescription>
                    We already have a resume on file for you — uploading a new one will replace it.
                  </AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resume">Resume (PDF, max 10 MB)</Label>
                  <Input
                    id="resume"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setError("");
                    }}
                  />
                  {error && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {error}
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground"
                  size="lg"
                  disabled={uploading || !file}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" /> Upload Resume
                    </>
                  )}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

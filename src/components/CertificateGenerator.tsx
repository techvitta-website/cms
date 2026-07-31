import { CSSProperties, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BadgeCheck, Download, Eye, Loader2, Search, Send } from "lucide-react";
import letterheadUrl from "@/assets/certificate/letterhead.png";
import signatureUrl from "@/assets/certificate/signature.png";

// ---------------------------------------------------------------------------
// Internship certificate generator (ADDITIVE feature).
// Replicates the official TechVitta certificate: the full-page letterhead
// artwork (logo, dotted band, watermark, footer) extracted from the issued
// sample is used as the sheet background, with the certificate text laid over
// it. Wording follows "Tech Vita internship certificateTemplateNov2025.docx".
// Flow: pick candidate -> fill details -> PREVIEW -> Generate & Send
// (uploads the PDF to the experience-letters bucket, emails it via the
// existing send-email function, records it in the letters history).
// ---------------------------------------------------------------------------

export interface CertificateCandidate {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  jobs?: { job_title: string; department?: string | null } | null;
}

interface CertificateData {
  salutation: "Mr." | "Ms.";
  fullName: string;
  email: string;
  position: string;
  projectType: string;
  projects: string;
  startDate: string;
  endDate: string;
  issueDate: string;
  title: string;
}

const EMPTY_FORM: CertificateData = {
  salutation: "Mr.",
  fullName: "",
  email: "",
  position: "",
  projectType: "projects",
  projects: "",
  startDate: "",
  endDate: "",
  issueDate: format(new Date(), "yyyy-MM-dd"),
  title: "Certificate Of Experience",
};

const ordinalDate = (d: string) => (d ? format(new Date(d), "do MMMM yyyy") : "");
const numericDate = (d: string) => (d ? format(new Date(d), "dd-MM-yyyy") : "");
const issueDateFmt = (d: string) => (d ? format(new Date(d), "dd-MMMM-yyyy") : "");

const titleCaseName = (name: string) =>
  name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

const PARAGRAPH: CSSProperties = {
  fontSize: "15.5px",
  lineHeight: 1.55,
  textAlign: "justify",
  margin: "0 0 26px 0",
};

// A4 sheet at 96dpi: 794 x 1123 px.
function CertificateSheet({
  data,
  innerRef,
}: {
  data: CertificateData;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const p =
    data.salutation === "Ms."
      ? { He: "She", him: "her" }
      : { He: "He", him: "him" };
  return (
    <div
      ref={innerRef}
      style={{
        width: 794,
        height: 1123,
        position: "relative",
        backgroundColor: "#ffffff",
        backgroundImage: `url(${letterheadUrl})`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        fontFamily: "'Bookman Old Style', Georgia, 'Times New Roman', serif",
        color: "#000000",
        overflow: "hidden",
      }}
    >
      {/* Company name sits in the letterhead band, centred */}
      <div
        style={{
          position: "absolute",
          top: 97,
          left: 170,
          right: 30,
          textAlign: "center",
          fontSize: 21,
          letterSpacing: "0.5px",
          fontFamily: "'Times New Roman', Georgia, serif",
        }}
      >
        TECHVITTA INNOVATIONS PRIVATE LIMITED
      </div>

      <div
        style={{
          position: "absolute",
          top: 188,
          right: 95,
          fontSize: 14.5,
          fontFamily: "Calibri, Arial, sans-serif",
        }}
      >
        <b>Date:</b> {issueDateFmt(data.issueDate)}
      </div>

      <div style={{ position: "absolute", top: 312, left: 95, right: 95 }}>
        <div
          style={{
            textAlign: "center",
            fontSize: 20,
            fontWeight: 700,
            textDecoration: "underline",
            marginBottom: 48,
          }}
        >
          {data.title}
        </div>

        <p style={PARAGRAPH}>
          This is to certify that{" "}
          <b>
            {data.salutation} {data.fullName.toUpperCase()},
          </b>{" "}
          interned as a <b>{data.position}</b> with us in the {data.projectType}{" "}
          <b>{data.projects}</b> modules from <b>{ordinalDate(data.startDate)}</b> to{" "}
          <b>{ordinalDate(data.endDate)}.</b>
        </p>

        <p style={PARAGRAPH}>
          This letter further confirms that {data.salutation}{" "}
          {titleCaseName(data.fullName)} has been relieved from all duties and
          responsibilities as of the close of business on {numericDate(data.endDate)},
          after successful completion of all internship requirements. There are no dues
          or obligations pending against {p.him} as on date.
        </p>

        <p style={PARAGRAPH}>
          {p.He} performed assigned tasks satisfactorily and maintained good conduct
          throughout.
        </p>

        <p style={{ ...PARAGRAPH, fontWeight: 700 }}>
          We wish {p.him} success in future endeavours.
        </p>

        <div style={{ marginTop: 42, fontSize: 15, lineHeight: 1.55 }}>
          <div>Best regards,</div>
          <div>Yours Sincerely,</div>
          <div>For Techvitta innovations Pvt Ltd.</div>
          <img
            src={signatureUrl}
            alt="Signature"
            style={{ width: 118, marginTop: 10, marginBottom: 4, display: "block" }}
          />
          <div>Raja Garapati</div>
          <div>Head</div>
          <div>People Success Team</div>
        </div>
      </div>
    </div>
  );
}

export default function CertificateGenerator({
  candidates,
  isLoading,
}: {
  candidates: CertificateCandidate[];
  isLoading?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [candidate, setCandidate] = useState<CertificateCandidate | null>(null);
  const [form, setForm] = useState<CertificateData>(EMPTY_FORM);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [dialogOpen, setDialogOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = q
      ? candidates.filter(
          (c) =>
            c.full_name?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            (c.phone ?? "").toLowerCase().includes(q),
        )
      : candidates;
    return list.slice(0, 25);
  }, [candidates, searchTerm]);

  const openFor = (c: CertificateCandidate) => {
    setCandidate(c);
    setForm({
      ...EMPTY_FORM,
      fullName: c.full_name ?? "",
      email: c.email ?? "",
      position: c.jobs?.job_title || "Intern",
      issueDate: format(new Date(), "yyyy-MM-dd"),
    });
    setStep("form");
    setDialogOpen(true);
  };

  const formValid =
    form.fullName.trim() &&
    form.email.trim() &&
    form.position.trim() &&
    form.projects.trim() &&
    form.startDate &&
    form.endDate;

  const makePdf = async (): Promise<{ blob: Blob; fileName: string }> => {
    if (!sheetRef.current) throw new Error("Certificate not rendered yet");
    const canvas = await html2canvas(sheetRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      0,
      0,
      pdf.internal.pageSize.getWidth(),
      pdf.internal.pageSize.getHeight(),
    );
    const cleanName = form.fullName.replace(/[^a-zA-Z0-9]+/g, "");
    const fileName = `TechVitta_internship_certificate_${cleanName}_${format(
      new Date(form.issueDate || new Date()),
      "MMMyyyy",
    )}.pdf`;
    return { blob: pdf.output("blob"), fileName };
  };

  const downloadPdf = async () => {
    try {
      const { blob, fileName } = await makePdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err.message || "Could not generate the PDF.",
        variant: "destructive",
      });
    }
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!candidate) throw new Error("No candidate selected");
      const { blob, fileName } = await makePdf();

      // 1. Upload to the existing experience-letters bucket.
      const storageFileName = `certificate-${candidate.id}-${Date.now()}-${fileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("experience-letters")
        .upload(storageFileName, blob, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from("experience-letters")
        .getPublicUrl(uploadData.path);
      const certificateUrl = urlData.publicUrl;

      // 2. Base64 for the email attachment (chunked to avoid stack overflow).
      const uint8Array = new Uint8Array(await blob.arrayBuffer());
      const chunkSize = 8192;
      let fileBase64 = "";
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        fileBase64 += String.fromCharCode.apply(null, Array.from(chunk));
      }
      fileBase64 = btoa(fileBase64);

      // 3. Email via the existing send-email function (same contract as the
      //    experience-letter upload flow).
      let emailSent = false;
      const { data: emailData, error: emailError } = await supabase.functions.invoke(
        "send-email",
        {
          body: {
            to: form.email,
            candidateName: form.fullName,
            emailType: "experience-letter-upload",
            data: {
              positionTitle: form.position,
              attachment: {
                filename: fileName,
                content: fileBase64,
                type: "application/pdf",
              },
              experience_letter_url: certificateUrl,
            },
          },
        },
      );
      if (emailError || !emailData?.success) {
        console.warn("Certificate email failed, file stored:", emailError || emailData?.error);
      } else {
        emailSent = true;
      }

      // 4. Record in the letters history (same table the History tab reads).
      const { error: dbError } = await (supabase.from("experience-letters") as any).insert({
        candidate_id: candidate.id,
        experience_letter_url: certificateUrl,
        file_name: fileName,
        file_type: "application/pdf",
        email: form.email,
        email_sent: emailSent,
      });
      if (dbError) console.error("Failed to save certificate record:", dbError);

      await supabase.from("activity_logs").insert({
        action: "INTERNSHIP_CERTIFICATE_SENT",
        details: `Internship certificate generated for ${form.fullName} (${form.email}). Email ${emailSent ? "sent" : "failed"}. File: ${fileName}`,
      });

      return { emailSent, certificateUrl };
    },
    onSuccess: (result) => {
      toast({
        title: result.emailSent ? "Certificate sent" : "Certificate stored",
        description: result.emailSent
          ? `Certificate emailed to ${form.email} and saved to history.`
          : "Certificate stored in history, but the email failed to send. You can resend from History.",
      });
      setDialogOpen(false);
      setCandidate(null);
      queryClient.invalidateQueries({ queryKey: ["experience-letters-history"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate the certificate.",
        variant: "destructive",
      });
    },
  });

  const setField = (key: keyof CertificateData, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
          Search Candidate
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, or phone"
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{searchTerm ? "No candidates found matching your search." : "No candidates found."}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">{c.full_name}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {c.email}
                  {c.jobs?.job_title ? ` · ${c.jobs.job_title}` : ""}
                </p>
              </div>
              <Button onClick={() => openFor(c)} className="shrink-0">
                <BadgeCheck className="mr-2 h-4 w-4" />
                Create certificate
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !sendMutation.isPending && setDialogOpen(open)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {step === "form" ? (
            <>
              <DialogHeader>
                <DialogTitle>Internship certificate — {candidate?.full_name}</DialogTitle>
                <DialogDescription>
                  Fill in the internship details. Nothing is sent until you preview and
                  confirm.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Salutation</Label>
                  <Select
                    value={form.salutation}
                    onValueChange={(v) => setField("salutation", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mr.">Mr.</SelectItem>
                      <SelectItem value="Ms.">Ms.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <Input
                    value={form.fullName}
                    onChange={(e) => setField("fullName", e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Email (certificate is sent here)</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Position / role</Label>
                  <Input
                    value={form.position}
                    onChange={(e) => setField("position", e.target.value)}
                    placeholder="e.g. Blockchain Developer"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Project word</Label>
                  <Select
                    value={form.projectType}
                    onValueChange={(v) => setField("projectType", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="projects">projects</SelectItem>
                      <SelectItem value="project">project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Project name(s)</Label>
                  <Input
                    value={form.projects}
                    onChange={(e) => setField("projects", e.target.value)}
                    placeholder="e.g. TrustDoc, ChainTrack and Dex"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Internship start date</Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setField("startDate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Internship end date</Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setField("endDate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Certificate date</Label>
                  <Input
                    type="date"
                    value={form.issueDate}
                    onChange={(e) => setField("issueDate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Certificate title</Label>
                  <Select value={form.title} onValueChange={(v) => setField("title", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Certificate Of Experience">
                        Certificate Of Experience
                      </SelectItem>
                      <SelectItem value="TO WHOM IT MAY CONCERN">
                        TO WHOM IT MAY CONCERN
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={!formValid} onClick={() => setStep("preview")}>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview certificate
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Preview — check every detail before sending</DialogTitle>
                <DialogDescription>
                  This exact PDF will be emailed to {form.email}.
                </DialogDescription>
              </DialogHeader>

              {/* Scaled-down visible preview */}
              <div className="mx-auto border border-border shadow-md overflow-hidden"
                style={{ width: 794 * 0.62, height: 1123 * 0.62 }}
              >
                <div style={{ transform: "scale(0.62)", transformOrigin: "top left" }}>
                  <CertificateSheet data={form} />
                </div>
              </div>

              {/* Full-size hidden copy used for the actual PDF capture */}
              <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
                <CertificateSheet data={form} innerRef={sheetRef} />
              </div>

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" onClick={() => setStep("form")} disabled={sendMutation.isPending}>
                  Back to edit
                </Button>
                <Button variant="outline" onClick={downloadPdf} disabled={sendMutation.isPending}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
                <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
                  {sendMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Generate &amp; send email
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

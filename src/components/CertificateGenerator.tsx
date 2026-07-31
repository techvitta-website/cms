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
import { Textarea } from "@/components/ui/textarea";
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
// Internship experience-certificate generator (ADDITIVE). Matches the issued
// "Certificate Of Experience" sample: company name centred, role + date range,
// an editable work-summary paragraph, relieving confirmation, and the
// signatory block — all on the official TechVitta letterhead.
// Flow: pick candidate -> fill details -> PREVIEW -> Generate & Send / Download.
// ---------------------------------------------------------------------------

export interface CertificateCandidate {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  feedback_rating?: number | null;
  feedback_decision?: "Approve" | "Reject" | null;
  jobs?: { job_title: string; department?: string | null } | null;
}

// Working-feedback badge — the feedback that makes a candidate eligible.
function FeedbackBadge({
  decision,
  rating,
}: {
  decision?: "Approve" | "Reject" | null;
  rating?: number | null;
}) {
  if (!decision && !rating) return null;
  const approved = decision === "Approve";
  const cls = approved
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-muted text-muted-foreground";
  const stars = rating ? ` · ${"★".repeat(Math.max(0, Math.min(5, Math.round(rating))))}` : "";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {approved ? "Feedback: Approved" : `Feedback: ${decision ?? "—"}`}
      {stars}
    </span>
  );
}

type Salutation = "Mr." | "Ms.";

interface CertificateData {
  salutation: Salutation;
  fullName: string;
  email: string;
  position: string;
  summary: string;
  startDate: string;
  endDate: string;
  issueDate: string;
  title: string;
}

const PRO: Record<Salutation, { s: string; o: string; p: string }> = {
  "Mr.": { s: "He", o: "him", p: "his" },
  "Ms.": { s: "She", o: "her", p: "her" },
};

const ordinalDate = (d: string) => (d ? format(new Date(d), "do MMMM yyyy") : "");
const relievedDate = (d: string) => (d ? format(new Date(d), "dd-MMM-yyyy") : "");
const issueDateFmt = (d: string) => (d ? format(new Date(d), "dd-MMMM-yyyy") : "");

const titleCaseName = (name: string) =>
  name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

// Role-aware work-summary body. Picks the activity description + closing line
// from keywords in the position, then fills in the correct pronouns.
function roleProfile(position: string): { activities: string; strength: string; field: string } {
  const r = (position || "").toLowerCase();
  const has = (...k: string[]) => k.some((x) => r.includes(x));

  if (has("ui", "ux", "design", "figma"))
    return {
      activities:
        "UI/UX design and product experience activities including user research, wireframing, prototyping in Figma, design-system creation, and delivering responsive interface designs",
      strength: "strong design thinking",
      field: "product design",
    };
  if (has("blockchain", "web3", "solidity", "smart contract"))
    return {
      activities:
        "blockchain development activities including smart contract design, testing and deployment, working with tokens and distributed ledger technologies, and technical documentation",
      strength: "strong analytical skills",
      field: "blockchain development",
    };
  if (has("data", "analyst", "analytics", "machine learning", " ml", "ai ", "data science"))
    return {
      activities:
        "data and analytics activities including data collection and cleaning, exploratory analysis, building dashboards and reports, and deriving actionable insights",
      strength: "strong analytical skills",
      field: "data analysis",
    };
  if (has("flutter", "mobile", "android", "ios", "react native"))
    return {
      activities:
        "mobile application development activities including building cross-platform features, UI implementation, API integration, testing, and release support",
      strength: "strong technical skills",
      field: "mobile development",
    };
  if (has("qa", "test", "quality"))
    return {
      activities:
        "quality assurance activities including test-case design, manual and automated testing, defect tracking, and release verification",
      strength: "strong attention to detail",
      field: "software testing",
    };
  if (has("hr", "human resource", "recruit", "talent", "people"))
    return {
      activities:
        "human resources activities including candidate sourcing and screening, interview coordination, onboarding support, and HR documentation",
      strength: "strong interpersonal skills",
      field: "recruitment",
    };
  if (has("market", "content", "seo", "social", "brand"))
    return {
      activities:
        "marketing activities including content creation, social-media management, campaign support, and performance tracking",
      strength: "strong creative skills",
      field: "digital marketing",
    };
  if (has("frontend", "front-end", "react", "web develop"))
    return {
      activities:
        "frontend web development activities including building responsive interfaces, component development, API integration, and testing",
      strength: "strong technical skills",
      field: "web development",
    };
  // Default — general software development.
  return {
    activities:
      "software development activities including backend development, API integrations, database management, debugging, testing, and deployment support",
    strength: "strong analytical skills",
    field: "software development",
  };
}

function defaultSummary(sal: Salutation, position: string): string {
  const g = PRO[sal];
  const { activities, strength, field } = roleProfile(position);
  return `During ${g.p} internship, ${g.s.toLowerCase()} was actively involved in ${activities}. ${g.s} demonstrated ${strength} and a solid understanding of modern ${field} practices.`;
}

const PARAGRAPH: CSSProperties = {
  fontSize: "15px",
  lineHeight: 1.55,
  textAlign: "justify",
  margin: "0 0 22px 0",
};

// A4 sheet at 96dpi: 794 x 1123 px.
function CertificateSheet({
  data,
  innerRef,
}: {
  data: CertificateData;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const g = PRO[data.salutation];
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
        fontFamily: "Calibri, Arial, 'Segoe UI', sans-serif",
        color: "#000000",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 165, left: 70, right: 70 }}>
        {/* Company name — centred, below the letterhead band */}
        <div
          style={{
            textAlign: "center",
            fontSize: 20,
            fontWeight: 700,
            fontFamily: "Arial, Helvetica, sans-serif",
            letterSpacing: "0.3px",
          }}
        >
          TECHVITTA INNOVATIONS PRIVATE LIMITED
        </div>
        <div style={{ textAlign: "right", fontSize: 14, marginTop: 6 }}>
          Date: {issueDateFmt(data.issueDate)}
        </div>

        <div
          style={{
            textAlign: "center",
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "Georgia, 'Times New Roman', serif",
            margin: "24px 0 30px",
          }}
        >
          {data.title}
        </div>

        <p style={PARAGRAPH}>
          This is to certify that{" "}
          <b>
            {data.salutation} {titleCaseName(data.fullName)},
          </b>{" "}
          interned as a <b>{data.position}</b> with us from{" "}
          <b>
            {ordinalDate(data.startDate)} to {ordinalDate(data.endDate)}.
          </b>
        </p>

        <p style={PARAGRAPH}>{data.summary}</p>

        <p style={PARAGRAPH}>
          This letter further confirms that {data.salutation} {titleCaseName(data.fullName)} has
          been relieved from all duties and responsibilities as of the close of business on{" "}
          {relievedDate(data.endDate)}, after successful completion of all internship requirements.
          There are no dues or obligations pending against {g.o} as on date.
        </p>

        <p style={PARAGRAPH}>
          {g.s} performed {g.p} assigned responsibilities diligently and maintained good
          professional conduct throughout {g.p} tenure.
        </p>

        <p style={{ ...PARAGRAPH, fontWeight: 700 }}>
          We wish {g.o} success in {g.p} future endeavours.
        </p>

        <div style={{ marginTop: 40, fontSize: 15, lineHeight: 1.55 }}>
          <div>Best regards,</div>
          <div>Yours Sincerely,</div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>For Techvitta Innovations Pvt Ltd.</div>
          <img
            src={signatureUrl}
            alt="Signature"
            style={{ width: 120, marginTop: 8, marginBottom: 4, display: "block" }}
          />
          <div style={{ fontWeight: 700 }}>Raja Garapati</div>
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
  const [form, setForm] = useState<CertificateData | null>(null);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [dialogOpen, setDialogOpen] = useState(false);
  // Once HR edits the summary, stop auto-regenerating it from role/salutation.
  const [summaryEdited, setSummaryEdited] = useState(false);
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
    const position = c.jobs?.job_title || "Intern";
    setSummaryEdited(false);
    setForm({
      salutation: "Mr.",
      fullName: c.full_name ?? "",
      email: c.email ?? "",
      position,
      summary: defaultSummary("Mr.", position),
      startDate: "",
      endDate: "",
      issueDate: format(new Date(), "yyyy-MM-dd"),
      title: "Certificate Of Experience",
    });
    setStep("form");
    setDialogOpen(true);
  };

  const setField = (key: keyof CertificateData, value: string) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  // Salutation: keep pronouns correct; regenerate summary unless HR edited it.
  const onSalutation = (v: string) =>
    setForm((f) => {
      if (!f) return f;
      const sal = v as Salutation;
      return { ...f, salutation: sal, summary: summaryEdited ? f.summary : defaultSummary(sal, f.position) };
    });

  // Role: regenerate the role-specific summary unless HR edited it.
  const onPosition = (v: string) =>
    setForm((f) => {
      if (!f) return f;
      return { ...f, position: v, summary: summaryEdited ? f.summary : defaultSummary(f.salutation, v) };
    });

  const formValid =
    form && form.fullName.trim() && form.email.trim() && form.position.trim() && form.startDate && form.endDate && form.summary.trim();

  const makePdf = async (): Promise<{ blob: Blob; fileName: string }> => {
    if (!sheetRef.current || !form) throw new Error("Certificate not rendered yet");
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
    const fileName = `TechVitta_Experience_Certificate_${cleanName}_${format(
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
      if (!candidate || !form) throw new Error("No candidate selected");
      const { blob, fileName } = await makePdf();

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

      const uint8Array = new Uint8Array(await blob.arrayBuffer());
      const chunkSize = 8192;
      let fileBase64 = "";
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        fileBase64 += String.fromCharCode.apply(null, Array.from(chunk));
      }
      fileBase64 = btoa(fileBase64);

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
        details: `Experience certificate generated for ${form.fullName} (${form.email}). Email ${emailSent ? "sent" : "failed"}. File: ${fileName}`,
      });

      return { emailSent, certificateUrl };
    },
    onSuccess: (result) => {
      toast({
        title: result.emailSent ? "Certificate sent" : "Certificate stored",
        description: result.emailSent
          ? `Certificate emailed to ${form?.email} and saved to history.`
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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground truncate">{c.full_name}</p>
                  <FeedbackBadge decision={c.feedback_decision} rating={c.feedback_rating} />
                </div>
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
          {form && step === "form" ? (
            <>
              <DialogHeader>
                <DialogTitle>Experience certificate — {candidate?.full_name}</DialogTitle>
                <DialogDescription>
                  Fill in the details. Nothing is sent until you preview and confirm.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Salutation</Label>
                  <Select value={form.salutation} onValueChange={onSalutation}>
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
                    onChange={(e) => onPosition(e.target.value)}
                    placeholder="e.g. Software Developer"
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
                  <Label>Internship start date</Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setField("startDate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Internship end date (relieving)</Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setField("endDate", e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Work summary (auto-fills from the role; edit to fit the intern)</Label>
                  <Textarea
                    rows={4}
                    value={form.summary}
                    onChange={(e) => {
                      setSummaryEdited(true);
                      setField("summary", e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
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
          ) : form && step === "preview" ? (
            <>
              <DialogHeader>
                <DialogTitle>Preview — check every detail before sending</DialogTitle>
                <DialogDescription>
                  This exact PDF will be emailed to {form.email}.
                </DialogDescription>
              </DialogHeader>

              {/* Scaled-down visible preview */}
              <div
                className="mx-auto border border-border shadow-md overflow-hidden"
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
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" /> Generate &amp; send email
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

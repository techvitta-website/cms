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
import { Download, Eye, FileX2, Loader2, Search, Send } from "lucide-react";
import letterheadUrl from "@/assets/certificate/letterhead.png";
import signatureUrl from "@/assets/certificate/signature.png";

// ---------------------------------------------------------------------------
// Rejection-letter generator (ADDITIVE). For candidates rejected in feedback.
// Produces a formal rejection letter PDF on the official TechVitta letterhead
// (wording from CMS Templates.docx), previews it, then Generate & Send — which
// emails the candidate the rejection (with the letter attached where supported),
// stores the PDF, records it in rejection_letters history, and marks the
// candidate "Rejected".
// ---------------------------------------------------------------------------

export interface RejectionCandidate {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  feedback_rating?: number | null;
  feedback_decision?: "Approve" | "Reject" | null;
  jobs?: { job_title: string; department?: string | null } | null;
}

interface RejectionData {
  salutation: "Mr." | "Ms.";
  fullName: string;
  email: string;
  position: string;
  letterDate: string;
}

const SHEET_W = 794;
const SHEET_H = 1123;
const longDate = (d: string) => (d ? format(new Date(d), "MMMM dd, yyyy") : "");

const titleCaseName = (name: string) =>
  name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

const bodyStyle: CSSProperties = {
  fontSize: "15px",
  lineHeight: 1.6,
  textAlign: "justify",
  margin: "0 0 20px 0",
};

function RejectionSheet({
  data,
  innerRef,
}: {
  data: RejectionData;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      style={{
        width: SHEET_W,
        height: SHEET_H,
        position: "relative",
        backgroundColor: "#ffffff",
        backgroundImage: `url(${letterheadUrl})`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        fontFamily: "Calibri, Arial, 'Segoe UI', sans-serif",
        color: "#111111",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 165, left: 70, right: 70 }}>
        <div
          style={{
            textAlign: "center",
            fontSize: 20,
            fontWeight: 700,
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        >
          TECHVITTA INNOVATIONS PRIVATE LIMITED
        </div>
        <div style={{ textAlign: "right", fontSize: 14, margin: "6px 0 24px" }}>
          Date: {longDate(data.letterDate)}
        </div>

        <div
          style={{
            textAlign: "center",
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "Georgia, 'Times New Roman', serif",
            marginBottom: 26,
          }}
        >
          Update on Your Application
        </div>

        <p style={bodyStyle}>
          Dear{" "}
          <b>
            {data.salutation} {titleCaseName(data.fullName)},
          </b>
        </p>
        <p style={bodyStyle}>
          Thank you for taking the time to participate in our recruitment process for the{" "}
          <b>{data.position}</b> role at <b>Techvitta Innovations Private Limited</b>. After careful
          evaluation, we regret to inform you that we will not be moving forward with your
          application at this time.
        </p>
        <p style={bodyStyle}>
          We truly appreciate your interest in our organization and the effort you invested
          throughout the process. We encourage you to apply again for future opportunities that
          match your skills and experience.
        </p>
        <p style={bodyStyle}>Wishing you success in your career ahead.</p>

        <div style={{ marginTop: 36, fontSize: 15, lineHeight: 1.6 }}>
          <div>Sincerely,</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>For Techvitta Innovations Pvt Ltd.</div>
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

export default function RejectionLetterGenerator({
  candidates,
  isLoading,
}: {
  candidates: RejectionCandidate[];
  isLoading?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [candidate, setCandidate] = useState<RejectionCandidate | null>(null);
  const [form, setForm] = useState<RejectionData | null>(null);
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

  const openFor = (c: RejectionCandidate) => {
    setCandidate(c);
    setForm({
      salutation: "Mr.",
      fullName: c.full_name ?? "",
      email: c.email ?? "",
      position: c.jobs?.job_title || "Intern",
      letterDate: format(new Date(), "yyyy-MM-dd"),
    });
    setStep("form");
    setDialogOpen(true);
  };

  const setField = (key: keyof RejectionData, value: string) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const valid = form && form.fullName.trim() && form.email.trim() && form.position.trim();

  const makePdf = async (): Promise<{ blob: Blob; fileName: string }> => {
    if (!sheetRef.current || !form) throw new Error("Not rendered yet");
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
    const fileName = `TechVitta_Rejection_Letter_${cleanName}_${format(
      new Date(form.letterDate || new Date()),
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
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!candidate || !form) throw new Error("No candidate selected");
      const { blob, fileName } = await makePdf();

      const storageFileName = `rejection-${candidate.id}-${Date.now()}-${fileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("experience-letters")
        .upload(storageFileName, blob, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from("experience-letters")
        .getPublicUrl(uploadData.path);
      const rejectionUrl = urlData.publicUrl;

      const uint8Array = new Uint8Array(await blob.arrayBuffer());
      const chunkSize = 8192;
      let fileBase64 = "";
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        fileBase64 += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)));
      }
      fileBase64 = btoa(fileBase64);

      let emailSent = false;
      const { data: emailData, error: emailError } = await supabase.functions.invoke("send-email", {
        body: {
          to: form.email,
          candidateName: form.fullName,
          emailType: "reject",
          data: {
            positionTitle: form.position,
            attachment: { filename: fileName, content: fileBase64, type: "application/pdf" },
          },
        },
      });
      if (emailError || !emailData?.success) {
        console.warn("Rejection email failed, file stored:", emailError || emailData?.error);
      } else {
        emailSent = true;
      }

      const { error: dbError } = await (supabase.from("rejection_letters") as any).insert({
        candidate_id: candidate.id,
        rejection_letter_url: rejectionUrl,
        file_name: fileName,
        file_type: "application/pdf",
        email: form.email,
        email_sent: emailSent,
      });
      if (dbError) console.error("Failed to save rejection letter record:", dbError);

      await supabase.from("candidates").update({ status: "Rejected" }).eq("id", candidate.id);
      await supabase.from("activity_logs").insert({
        action: "REJECTION_LETTER_SENT",
        details: `Rejection letter generated for ${form.fullName} (${form.email}). Email ${emailSent ? "sent" : "failed"}. File: ${fileName}`,
      });

      return { emailSent };
    },
    onSuccess: (result) => {
      toast({
        title: result.emailSent ? "Rejection letter sent" : "Rejection letter stored",
        description: result.emailSent
          ? `Rejection notice emailed to ${form?.email} and saved to history.`
          : "Rejection letter stored in history, but the email failed to send.",
      });
      setDialogOpen(false);
      setCandidate(null);
      queryClient.invalidateQueries({ queryKey: ["rejected-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["rejection-letters-history"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate rejection letter.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">Search Candidate</p>
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
          <p>{searchTerm ? "No candidates found matching your search." : "No rejected candidates found."}</p>
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
                  <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-400">
                    Feedback: Rejected
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {c.email}
                  {c.jobs?.job_title ? ` · ${c.jobs.job_title}` : ""}
                </p>
              </div>
              <Button onClick={() => openFor(c)} variant="outline" className="shrink-0">
                <FileX2 className="mr-2 h-4 w-4" />
                Create rejection letter
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
                <DialogTitle>Rejection letter — {candidate?.full_name}</DialogTitle>
                <DialogDescription>
                  Confirm the details. Nothing is sent until you preview and confirm.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Salutation</Label>
                  <Select value={form.salutation} onValueChange={(v) => setField("salutation", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mr.">Mr.</SelectItem>
                      <SelectItem value="Ms.">Ms.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <Input value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Email (rejection is sent here)</Label>
                  <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Role applied for</Label>
                  <Input value={form.position} onChange={(e) => setField("position", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Letter date</Label>
                  <Input type="date" value={form.letterDate} onChange={(e) => setField("letterDate", e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button disabled={!valid} onClick={() => setStep("preview")}>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview letter
                </Button>
              </DialogFooter>
            </>
          ) : form && step === "preview" ? (
            <>
              <DialogHeader>
                <DialogTitle>Preview — check before sending</DialogTitle>
                <DialogDescription>The rejection will be emailed to {form.email}.</DialogDescription>
              </DialogHeader>

              <div
                className="mx-auto border border-border shadow-md overflow-hidden"
                style={{ width: SHEET_W * 0.6, height: SHEET_H * 0.6 }}
              >
                <div style={{ transform: "scale(0.6)", transformOrigin: "top left" }}>
                  <RejectionSheet data={form} />
                </div>
              </div>

              <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
                <RejectionSheet data={form} innerRef={sheetRef} />
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
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
                  ) : (
                    <><Send className="mr-2 h-4 w-4" /> Generate &amp; send</>
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

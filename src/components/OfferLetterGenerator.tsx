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
import { Download, Eye, FileSignature, Loader2, Search, Send } from "lucide-react";
import letterheadUrl from "@/assets/certificate/letterhead.png";
import signatureUrl from "@/assets/certificate/signature.png";

// ---------------------------------------------------------------------------
// Internship Offer Letter generator (ADDITIVE). Produces a real 2-page PDF —
// the Internship Offer Letter and the NDA — on the official TechVitta
// letterhead, matching the issued sample. Flow: pick approved candidate ->
// fill details -> PREVIEW both pages -> Generate & Send (uploads to the
// offer-letters bucket, emails via the existing send-email function, records
// in the offer-letters history, marks candidate "Offer Released").
// ---------------------------------------------------------------------------

export interface OfferCandidate {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  jobs?: { job_title: string; department?: string | null } | null;
}

interface OfferData {
  salutation: "Mr." | "Ms.";
  fullName: string;
  email: string;
  position: string;
  department: string;
  internshipType: "Paid" | "Unpaid";
  managerName: string;
  joiningLocation: string;
  salary: string;
  startDate: string;
  endDate: string;
  offerDate: string;
}

const longDate = (d: string) => (d ? format(new Date(d), "MMMM dd, yyyy") : "To be decided");
const shortDate = (d: string) => (d ? format(new Date(d), "dd MMMM yyyy") : "");

const SHEET_W = 794;
const SHEET_H = 1123;

const bodyStyle = (fs: number): CSSProperties => ({
  fontSize: `${fs}px`,
  lineHeight: 1.5,
  textAlign: "justify",
  margin: "0 0 11px 0",
});

// A letterhead-backed A4 sheet with safe top/bottom margins clear of the
// header band and footer artwork.
function Sheet({
  children,
  innerRef,
}: {
  children: React.ReactNode;
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
      <div style={{ position: "absolute", top: 150, left: 66, right: 66, bottom: 70 }}>
        {children}
      </div>
    </div>
  );
}

function OfferPage({ data, innerRef }: { data: OfferData; innerRef?: React.Ref<HTMLDivElement> }) {
  const payClause =
    data.internshipType === "Paid"
      ? `This is a paid internship. Based on your performance, learning progress, and the quality of work delivered, a stipend${data.salary ? ` of ${data.salary}` : ""} will be provided as per management discretion.`
      : "Please note that this is a training-oriented internship and not a full-time employment relationship. Your performance and contribution will be regularly reviewed by the manager. Based on your performance, learning progress, and the quality of work delivered, a stipend or payment may be provided as per management discretion.";
  return (
    <Sheet innerRef={innerRef}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
        INTERNSHIP OFFER LETTER
      </div>
      <p style={bodyStyle(13)}>
        Dear <b>{data.salutation} {data.fullName.toUpperCase()},</b>
      </p>
      <p style={bodyStyle(13)}>
        We are pleased to offer you the opportunity to join <b>TechVitta</b>, as an{" "}
        <b>{data.position}</b>
        {data.department ? (
          <> in the <b>{data.department}</b> department</>
        ) : null}
        . This internship is designed to provide you with valuable hands-on learning experience and
        exposure to the professional environment of our organization.
      </p>
      <p style={bodyStyle(13)}>
        Your internship is scheduled to begin on <b>{longDate(data.startDate)}</b> and will continue
        until <b>{longDate(data.endDate)}</b>, unless extended or concluded earlier by either party
        with prior notice. During this period, you will report to{" "}
        {data.managerName ? <b>{data.managerName}</b> : "the concerned manager"} or any other person
        assigned by the management.
      </p>
      <p style={bodyStyle(13)}>{payClause}</p>
      <p style={bodyStyle(13)}>
        The amount, frequency, and nature of such payment will depend on the manager's assessment and
        organizational policies. The decision of the manager regarding performance evaluation and
        payment will be considered final.
      </p>
      <p style={bodyStyle(13)}>
        You are expected to maintain professional conduct, punctuality, and confidentiality at all
        times. The company reserves the right to discontinue the internship if the assigned
        guidelines are not followed.
      </p>
      <p style={bodyStyle(13)}>
        We look forward to having you as part of our team and are confident that this experience will
        contribute positively to your personal and professional growth.
      </p>
      <p style={bodyStyle(13)}>
        Please confirm your acceptance by signing below and returning a scanned copy to us.
      </p>
      <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
        <div>Best regards,</div>
        <div>Yours Sincerely,</div>
        <div>
          For <b>Techvitta innovations Pvt Ltd.</b>
        </div>
        <img
          src={signatureUrl}
          alt="Signature"
          style={{ width: 110, marginTop: 8, marginBottom: 2, display: "block" }}
        />
        <div style={{ fontWeight: 700 }}>Raja Garapati</div>
        <div>Head</div>
        <div>People Success Team</div>
      </div>
      <div style={{ marginTop: 22, fontSize: 13, lineHeight: 1.9 }}>
        <div>Accepted and agreed by:</div>
        <div>Signature: _______________________</div>
        <div>Name: ___________________________</div>
        <div>Date: ____________________________</div>
      </div>
    </Sheet>
  );
}

function NdaPage({ data, innerRef }: { data: OfferData; innerRef?: React.Ref<HTMLDivElement> }) {
  const s = bodyStyle(11);
  return (
    <Sheet innerRef={innerRef}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
        NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT
      </div>
      <p style={s}>
        This Non-Disclosure and Confidentiality Agreement is made and entered into as of{" "}
        <b>{longDate(data.offerDate)}</b> by and between:
      </p>
      <p style={s}>
        <b>TechVitta</b>, a company with its principal place of business at Plot No 19, Huda Techno
        Enclave, Hitech City, Madhapur, Hyderabad (hereinafter referred to as the "Company");
      </p>
      <p style={s}>
        AND <b>{data.fullName.toUpperCase()}</b> (hereinafter referred to as the "Employee/Intern").
      </p>
      <p style={s}>
        <b>1. Purpose:</b> The Company is engaged in various business activities, including providing
        services to its clients. In the course of the Employee/Intern's engagement with the Company,
        the Employee/Intern will be exposed to and will have access to certain proprietary and
        confidential information of the Company and its Clients. The purpose of this Agreement is to
        ensure the protection of such Confidential Information.
      </p>
      <p style={s}>
        <b>2. Definition of Confidential Information:</b> "Confidential Information" shall mean any and
        all information, whether written, oral, electronic, or in any other form, that is disclosed by
        the Company or its Clients to the Employee/Intern, or to which the Employee/Intern obtains
        access, related to the business of the Company and its Clients. This includes, but is not
        limited to: a. All non-public information related to the Company's and Clients' business,
        including business plans, financial data, marketing strategies, and customer lists. b. All
        technical information, including software, source code, data, algorithms, schematics,
        processes, inventions, and research. c. Any information of a third party, including clients,
        that the Company is under an obligation of confidentiality to protect.
      </p>
      <p style={s}>
        <b>3. Obligations of the Employee/Intern:</b> The Employee/Intern agrees to: a) Hold all
        Confidential Information in the strictest confidence and not disclose, distribute, or
        disseminate it to any third party without the prior written consent of the Company. b) Use the
        Confidential Information solely for the purpose of fulfilling the duties assigned by the
        Company. c) Not copy, reproduce, or store Confidential Information on any personal devices or
        in unauthorized locations. d) Take all reasonable measures to protect the secrecy of and avoid
        disclosure or use of Confidential Information.
      </p>
      <p style={s}>
        <b>4. Exclusions:</b> Confidential Information shall not include any information that: a. Is or
        becomes publicly available through no fault of the Employee/Intern. b. Was in the
        Employee/Intern's possession prior to its disclosure by the Company, as evidenced by written
        records. c. Is rightfully received by the Employee/Intern from a third party without breach of
        any confidentiality obligation. d. Is approved for release by prior written consent of the
        Company.
      </p>
      <p style={s}>
        <b>5. Term and Termination:</b> The Employee/Intern's obligations under this Agreement shall
        remain in effect for the duration of the engagement and shall survive its termination for a
        period of five (5) years thereafter for Company information and ten (10) years thereafter for
        Client-specific information. Upon termination of the engagement, the Employee/Intern must
        immediately return all Confidential Information and all copies thereof to the Company.
      </p>
      <p style={s}>
        <b>6. Remedies:</b> The Employee/Intern acknowledges that any breach of this Agreement will
        cause irreparable harm to the Company and its Clients, for which monetary damages may be an
        insufficient remedy. The Employee/Intern therefore agrees that, in the event of a breach, the
        Company shall be entitled to seek injunctive relief and any other remedies available at law or
        in equity, including recovery of damages.
      </p>
      <p style={s}>
        <b>7. Governing Law:</b> This Agreement shall be governed by and construed in accordance with
        the laws of Hyderabad.
      </p>
      <p style={s}>
        IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written
        above.
      </p>
      <div style={{ marginTop: 26, fontSize: 12, lineHeight: 2 }}>
        <div>For and on behalf of TechVitta: ______________________</div>
        <div style={{ marginTop: 14 }}>Employee/Intern: ______________________</div>
      </div>
    </Sheet>
  );
}

export default function OfferLetterGenerator({
  candidates,
  isLoading,
}: {
  candidates: OfferCandidate[];
  isLoading?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [candidate, setCandidate] = useState<OfferCandidate | null>(null);
  const [form, setForm] = useState<OfferData | null>(null);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [dialogOpen, setDialogOpen] = useState(false);
  const offerRef = useRef<HTMLDivElement>(null);
  const ndaRef = useRef<HTMLDivElement>(null);

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

  const openFor = (c: OfferCandidate) => {
    setCandidate(c);
    setForm({
      salutation: "Mr.",
      fullName: c.full_name ?? "",
      email: c.email ?? "",
      position: c.jobs?.job_title || "Intern",
      department: c.jobs?.department || "",
      internshipType: "Unpaid",
      managerName: "",
      joiningLocation: "Hyderabad",
      salary: "",
      startDate: "",
      endDate: "",
      offerDate: format(new Date(), "yyyy-MM-dd"),
    });
    setStep("form");
    setDialogOpen(true);
  };

  const setField = (key: keyof OfferData, value: string) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const valid = form && form.fullName.trim() && form.email.trim() && form.position.trim() && form.startDate && form.endDate;

  const makePdf = async (): Promise<{ blob: Blob; fileName: string }> => {
    if (!offerRef.current || !ndaRef.current || !form) throw new Error("Not rendered yet");
    const opts = { scale: 2, useCORS: true, backgroundColor: "#ffffff" as const };
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    const c1 = await html2canvas(offerRef.current, opts);
    pdf.addImage(c1.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
    pdf.addPage();
    const c2 = await html2canvas(ndaRef.current, opts);
    pdf.addImage(c2.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
    const cleanName = form.fullName.replace(/[^a-zA-Z0-9]+/g, "");
    const fileName = `TechVitta_OfferLetter_${cleanName}_${format(new Date(form.offerDate || new Date()), "MMMyyyy")}.pdf`;
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

      const storageFileName = `generated-offer-${candidate.id}-${Date.now()}-${fileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("offer-letters")
        .upload(storageFileName, blob, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from("offer-letters").getPublicUrl(uploadData.path);
      const offerLetterUrl = urlData.publicUrl;

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
          emailType: "offer-letter-upload",
          data: {
            positionTitle: form.position,
            attachment: { filename: fileName, content: fileBase64, type: "application/pdf" },
            offer_letter_url: offerLetterUrl,
          },
        },
      });
      if (emailError || !emailData?.success) {
        console.warn("Offer email failed, file stored:", emailError || emailData?.error);
      } else {
        emailSent = true;
      }

      const { error: dbError } = await (supabase.from("offer-letters") as any).insert({
        candidate_id: candidate.id,
        position: form.position,
        department: form.department || "IT",
        internship_type: form.internshipType,
        salary: form.salary || null,
        start_date: form.startDate,
        end_date: form.endDate,
        manager_name: form.managerName || "HR Manager",
        joining_location: form.joiningLocation || "Hyderabad",
        email: form.email,
        offer_letter_url: offerLetterUrl,
      });
      if (dbError) console.error("Failed to save offer letter record:", dbError);

      await supabase.from("candidates").update({ status: "Offer Released" }).eq("id", candidate.id);
      await supabase.from("activity_logs").insert({
        action: "OFFER_LETTER_GENERATED_SENT",
        details: `Offer letter generated for ${form.fullName} (${form.email}). Email ${emailSent ? "sent" : "failed"}. File: ${fileName}`,
      });

      return { emailSent };
    },
    onSuccess: (result) => {
      toast({
        title: result.emailSent ? "Offer letter sent" : "Offer letter stored",
        description: result.emailSent
          ? `Offer letter emailed to ${form?.email} and saved to history.`
          : "Offer letter stored in history, but the email failed to send.",
      });
      setDialogOpen(false);
      setCandidate(null);
      queryClient.invalidateQueries({ queryKey: ["approved-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["offer-letters-history"] });
      queryClient.invalidateQueries({ queryKey: ["approved-count"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate offer letter.", variant: "destructive" });
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
          <p>{searchTerm ? "No candidates found matching your search." : "No approved candidates found."}</p>
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
                <FileSignature className="mr-2 h-4 w-4" />
                Create offer letter
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !sendMutation.isPending && setDialogOpen(open)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {form && step === "form" ? (
            <>
              <DialogHeader>
                <DialogTitle>Offer letter — {candidate?.full_name}</DialogTitle>
                <DialogDescription>
                  Fill in the details. Nothing is sent until you preview and confirm.
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
                  <Label>Email (offer letter is sent here)</Label>
                  <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Position / role</Label>
                  <Input value={form.position} onChange={(e) => setField("position", e.target.value)} placeholder="Intern" />
                </div>
                <div className="space-y-2">
                  <Label>Department (optional)</Label>
                  <Input value={form.department} onChange={(e) => setField("department", e.target.value)} placeholder="e.g. Blockchain" />
                </div>
                <div className="space-y-2">
                  <Label>Internship type</Label>
                  <Select value={form.internshipType} onValueChange={(v) => setField("internshipType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Unpaid">Unpaid</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stipend (optional, if paid)</Label>
                  <Input value={form.salary} onChange={(e) => setField("salary", e.target.value)} placeholder="e.g. ₹10,000 / month" />
                </div>
                <div className="space-y-2">
                  <Label>Reporting manager (optional)</Label>
                  <Input value={form.managerName} onChange={(e) => setField("managerName", e.target.value)} placeholder="e.g. Raja Garapati" />
                </div>
                <div className="space-y-2">
                  <Label>Joining location</Label>
                  <Input value={form.joiningLocation} onChange={(e) => setField("joiningLocation", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setField("startDate", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End date</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setField("endDate", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Offer date</Label>
                  <Input type="date" value={form.offerDate} onChange={(e) => setField("offerDate", e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button disabled={!valid} onClick={() => setStep("preview")}>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview offer letter
                </Button>
              </DialogFooter>
            </>
          ) : form && step === "preview" ? (
            <>
              <DialogHeader>
                <DialogTitle>Preview — 2 pages (Offer Letter + NDA)</DialogTitle>
                <DialogDescription>This exact PDF will be emailed to {form.email}.</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col items-center gap-4">
                {[0, 1].map((pageIdx) => (
                  <div
                    key={pageIdx}
                    className="border border-border shadow-md overflow-hidden"
                    style={{ width: SHEET_W * 0.55, height: SHEET_H * 0.55 }}
                  >
                    <div style={{ transform: "scale(0.55)", transformOrigin: "top left" }}>
                      {pageIdx === 0 ? <OfferPage data={form} /> : <NdaPage data={form} />}
                    </div>
                  </div>
                ))}
              </div>

              {/* Full-size hidden copies used for PDF capture */}
              <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
                <OfferPage data={form} innerRef={offerRef} />
                <NdaPage data={form} innerRef={ndaRef} />
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
                    <><Send className="mr-2 h-4 w-4" /> Generate &amp; send email</>
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

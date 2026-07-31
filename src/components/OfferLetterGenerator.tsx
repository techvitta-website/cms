import { CSSProperties, ReactNode, useMemo, useRef, useState } from "react";
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
// Internship Offer Letter generator (ADDITIVE). Two official templates:
//   • UNPAID — the detailed multi-section letter (Offer letter format.docx):
//     appointment terms, completion certificate, documents to submit, roles &
//     responsibilities, confidentiality & IP, terms & conditions.
//   • PAID — the concise Internship Offer Letter + NDA (matches the issued
//     sample PDF), with a stipend line.
// HR only fills the candidate name and email; everything else is fixed on the
// template (position "Intern", HR contact, signatory), with a defaulted
// commencement date. Both render on the official TechVitta letterhead and are
// e-mailed via the existing send-email function.
// ---------------------------------------------------------------------------

export interface OfferCandidate {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  document_verification_status?: string | null;
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

// CID / document verification status shown per candidate (informational — it does
// not block offer-letter generation).
function CidBadge({ status }: { status?: string | null }) {
  const s = (status || "not_requested").toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    verified: { label: "CID verified", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    submitted: { label: "CID submitted", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    requested: { label: "CID requested", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
    not_requested: { label: "CID not requested", cls: "bg-muted text-muted-foreground" },
    rejected: { label: "CID rejected", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  };
  const { label, cls } = map[s] ?? map.not_requested;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

type InternshipType = "Unpaid" | "Paid";

interface OfferData {
  salutation: "Mr." | "Ms.";
  fullName: string;
  email: string;
  internshipType: InternshipType;
  stipend: string;
  commenceDate: string;
  offerDate: string;
}

const SHEET_W = 794;
const SHEET_H = 1123;
const HR_CONTACT = "+91 7842852957";

const ordinal = (d: string) => (d ? format(new Date(d), "do MMMM yyyy") : "");

const body = (fs: number): CSSProperties => ({
  fontSize: `${fs}px`,
  lineHeight: 1.45,
  textAlign: "justify",
  margin: "0 0 9px 0",
});

function Sheet({ children, innerRef }: { children: ReactNode; innerRef?: (el: HTMLDivElement | null) => void }) {
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
      <div style={{ position: "absolute", top: 150, left: 64, right: 64, bottom: 66 }}>{children}</div>
    </div>
  );
}

const SignatureBlock = () => (
  <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45 }}>
    <div>Yours Sincerely,</div>
    <div>
      For <b>Techvitta innovations Pvt Ltd.</b>
    </div>
    <img src={signatureUrl} alt="Signature" style={{ width: 105, marginTop: 6, marginBottom: 2, display: "block" }} />
    <div style={{ fontWeight: 700 }}>Raja Garapati</div>
    <div>Head</div>
    <div>People Success Team</div>
  </div>
);

const AcceptLine = () => (
  <div style={{ marginTop: 16, fontSize: 12, lineHeight: 1.8 }}>
    <div>Signature: ________________________&nbsp;&nbsp;&nbsp;Date: ________________</div>
  </div>
);

const Bullets = ({ items, fs = 11 }: { items: string[]; fs?: number }) => (
  <ul style={{ margin: "0 0 9px 0", paddingLeft: 20 }}>
    {items.map((it, i) => (
      <li key={i} style={{ fontSize: fs, lineHeight: 1.45, textAlign: "justify", marginBottom: 3 }}>
        {it}
      </li>
    ))}
  </ul>
);

// ---------------------- UNPAID (detailed) template ----------------------
function unpaidPages(d: OfferData): ReactNode[] {
  const name = `${d.salutation} ${d.fullName.toUpperCase()}`;
  const b = body(11.5);

  const page1 = (
    <Sheet>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        <b>Offer Date:</b> {ordinal(d.offerDate)}
      </div>
      <div style={{ fontSize: 12 }}>To,</div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{name},</div>
      <p style={b}>
        We are pleased to offer you an <b>unpaid internship</b> with Tech Vitta for the position of{" "}
        <b>Intern</b>. This internship will provide you with valuable hands-on experience and exposure
        to blockchain technologies, systems, and real-world project implementation.
      </p>
      <p style={b}>
        It is very important that you keep the terms of this Internship letter highly confidential at
        all times.
      </p>
      <p style={b}>
        Please note that these terms are based on an individual's experience, background and potential,
        and are unique to each individual. This Internship letter contains the broad terms and
        conditions of your service which shall be subject to change from time to time ("Internship
        Letter").
      </p>
      <div style={{ fontSize: 12, fontWeight: 700, margin: "4px 0 6px" }}>Appointment:</div>
      <p style={b}>a) Your date of internship Commencement is effective on or before {ordinal(d.commenceDate)}.</p>
      <p style={b}>
        b) This offer is made on the clear understanding that your internship is on whole time basis
        and that you will not undertake any other part time/ full–time work, without the prior written
        consent of the company.
      </p>
      <p style={b}>c) This is an unpaid internship, and no stipend or remuneration will be provided.</p>
      <p style={b}>
        d) You agree to abide by the company's rules, regulations and policies ("Company Policies") as
        may be in effect from time to time with respect to your function, grade or location where you
        work in.
      </p>
      <p style={b}>e) Notice Period: Either party may terminate this internship with prior written notice of 7 days.</p>
      <p style={b}>
        f) If at any stage of your tenure of your service, it is found that- Any particulars or details
        furnished by you are incorrect and/ or this agreement of service has been obtained by
        misinterpretation of facts; or misconduct/fraud during your service with us or you have
        indulged in misrepresentation while dealing with customers; or the client has complained
        against you or your performance, your services shall be terminated without any notice or
        compensation.
      </p>
      <p style={b}>g) The internship does not guarantee employment upon completion.</p>
      <p style={b}>
        h) You are expected to maintain professional conduct, meet deadlines, and actively contribute
        to assigned tasks.
      </p>
    </Sheet>
  );

  const page2 = (
    <Sheet>
      <p style={b}>
        Upon successful completion of the internship and submission of required deliverables, you will
        be issued an Internship Completion Certificate acknowledging your contribution, which may
        further be extended at the discretion of the company.
      </p>
      <p style={b}>
        Please note that the offer stands cancelled if we do not receive your acceptance within three
        working days. Further this offer is valid subject to clearance of background verification.
      </p>
      <p style={b}>
        In the meantime, if you have any questions or clarifications, please don't hesitate to contact
        HR at {HR_CONTACT}.
      </p>
      <SignatureBlock />
      <p style={{ ...b, marginTop: 18 }}>
        I, <b>{name}</b>, hereby accept the offer for the unpaid internship position as described in
        this letter dated. Shall report for duty on or before _________________
      </p>
      <AcceptLine />
      <div style={{ fontSize: 12, fontWeight: 700, margin: "18px 0 6px" }}>
        Please ensure to submit the documents listed below at the time of joining duties.
      </div>
      <Bullets
        items={[
          "Copy of latest CV;",
          "Academic testimonials (10th, 12th, Graduation, Post-Graduation, etc.,);",
          "Originals for verification;",
          "Photo copies for submission;",
          "Professional Certifications (If any);",
          "Passport size latest photographs (Colour);",
          "Identity Proof (Photo copy);",
          "Residence Proof (Photo copy);",
          "Cancelled Cheque (Photo Copy);",
          "Experience/Internship Certificate from the previous employer; (-If Any-)",
          "Reference numbers and Official email IDs of previous companies/institutes; (-Do-)",
          "Contact number of Supervisor/Manager/ HOD of previous companies/institutes. (-Do-)",
        ]}
      />
    </Sheet>
  );

  const page3 = (
    <Sheet>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Roles &amp; Responsibilities:</div>
      <p style={b}>During your internship, you will be expected to:</p>
      <Bullets
        items={[
          "Research and assist in developing blockchain-based systems and applications.",
          "Work with smart contracts, tokens, and distributed ledger technologies.",
          "Contribute to coding, testing, and documentation of blockchain modules.",
          "Participate in team meetings, reviews, and brainstorming sessions.",
          "Maintain confidentiality and adhere to the company's policies and code of conduct.",
          "Assist in the design, development, and testing of smart contracts (e.g., Ethereum/Solidity).",
          "Work with the team on integrating blockchain features into our applications.",
          "Conduct research on emerging blockchain protocols and scalability solutions.",
          "Participate in code reviews and contribute to technical documentation.",
          "Collaborate with cross-functional teams (DevOps, UX/UI, QA) to deliver robust solutions.",
        ]}
      />
      <div style={{ fontSize: 12.5, fontWeight: 700, margin: "10px 0 6px" }}>Confidentiality &amp; IP</div>
      <p style={b}>By accepting this offer, you agree to:</p>
      <Bullets
        items={[
          "Maintain the confidentiality of all proprietary information, product details, and trade secrets of Techvitta.",
          "Not disclose or share any internal documentation, data, or test results with unauthorized individuals.",
          "Assign to Techvitta any intellectual property rights in any testing tools, documentation, or test automation scripts you create during the internship.",
          "Abide by Techvitta's code of conduct and uphold the integrity and professionalism expected of all team members.",
        ]}
      />
    </Sheet>
  );

  const page4 = (
    <Sheet>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Terms &amp; Conditions</div>
      <p style={b}>
        <b>Internship Tenure:</b> The internship will commence on dated above and continue for a period
        as determined by project requirements and individual performance.
      </p>
      <p style={b}>
        <b>Unpaid Internship Period:</b> The initial Thirty (30) working days of your internship shall
        be unpaid. During this period, your performance, learning curve, and engagement will be
        continuously evaluated.
      </p>
      <p style={b}>
        <b>Performance Evaluation &amp; Paid Internship:</b> Upon completion of the unpaid internship
        period, a performance evaluation will be conducted. Based on your evaluation outcome, you may be
        offered a paid internship with revised terms and a monthly stipend/salary as per the company's
        discretion.
      </p>
      <p style={b}>
        <b>Discretionary Extension:</b> The Company reserves the right to extend the unpaid or paid
        internship duration based on business needs, individual performance, and other internal
        considerations. The Company is not obligated to transition an intern from unpaid to paid status
        if performance standards are not met.
      </p>
      <p style={b}>
        <b>On-Role Employment Opportunity:</b> After six (6) months of continuous paid internship, you
        will become eligible to be considered for full-time employment (on-role) with Techvitta
        Innovations Pvt Ltd, subject to: ▪ Satisfactory performance evaluations ▪ Availability of
        suitable positions ▪ Successful completion of a separate formal interview and assessment
        process.
      </p>
      <p style={b}>
        <b>No Employment Guarantee:</b> Please note that participation in the internship program,
        whether unpaid or paid, does not guarantee an offer of full-time employment.
      </p>
      <p style={b}>
        <b>Company's Rights:</b> The Company retains the full discretion to alter, extend, or terminate
        the internship program based on organizational needs, performance parameters, or disciplinary
        considerations.
      </p>
      <p style={b}>
        <b>Confidentiality &amp; Intellectual Property:</b> You will be required to maintain strict
        confidentiality regarding all information and assign to Techvitta Innovations Pvt Ltd all
        intellectual property created during your internship.
      </p>
      <div style={{ fontSize: 12.5, fontWeight: 700, margin: "10px 0 6px" }}>Intern's Acceptance</div>
      <p style={b}>I, {d.fullName.toUpperCase()}, accept the terms and conditions of the internship offer as outlined above.</p>
      <AcceptLine />
    </Sheet>
  );

  return [page1, page2, page3, page4];
}

// ---------------------- PAID (concise) template + NDA ----------------------
function paidPages(d: OfferData): ReactNode[] {
  const name = `${d.salutation} ${d.fullName.toUpperCase()}`;
  const b = body(13);
  const s = body(11);

  const offer = (
    <Sheet>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginBottom: 14 }}>
        INTERNSHIP OFFER LETTER
      </div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <b>Offer Date:</b> {ordinal(d.offerDate)}
      </div>
      <p style={b}>
        Dear <b>{name},</b>
      </p>
      <p style={b}>
        We are pleased to offer you a <b>paid internship</b> with <b>TechVitta</b> for the position of{" "}
        <b>Intern</b>. This internship is designed to provide you with valuable hands-on learning
        experience and exposure to the professional environment of our organization.
      </p>
      <p style={b}>
        Your internship is scheduled to begin on or before <b>{ordinal(d.commenceDate)}</b> and will
        continue for a period determined by project requirements and individual performance, unless
        extended or concluded earlier by either party with prior notice.
      </p>
      <p style={b}>
        This is a paid internship. A monthly stipend
        {d.stipend ? (
          <>
            {" "}
            of <b>{d.stipend}</b>
          </>
        ) : null}{" "}
        will be provided as per the company's policies. Your performance and contribution will be
        regularly reviewed by the manager, and the stipend may be revised at management discretion
        based on your performance and the quality of work delivered.
      </p>
      <p style={b}>
        You are expected to maintain professional conduct, punctuality, and confidentiality at all
        times. The company reserves the right to discontinue the internship if the assigned guidelines
        are not followed.
      </p>
      <p style={b}>
        We look forward to having you as part of our team and are confident that this experience will
        contribute positively to your personal and professional growth.
      </p>
      <p style={b}>Please confirm your acceptance by signing below and returning a scanned copy to us.</p>
      <div style={{ marginTop: 4, fontSize: 13 }}>Best regards,</div>
      <SignatureBlock />
      <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.85 }}>
        <div>Accepted and agreed by:</div>
        <div>Signature: _______________________</div>
        <div>Name: ___________________________</div>
        <div>Date: ____________________________</div>
      </div>
    </Sheet>
  );

  const nda = (
    <Sheet>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
        NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT
      </div>
      <p style={s}>
        This Non-Disclosure and Confidentiality Agreement is made and entered into as of{" "}
        <b>{ordinal(d.offerDate)}</b> by and between:
      </p>
      <p style={s}>
        <b>TechVitta</b>, a company with its principal place of business at Plot No 19, Huda Techno
        Enclave, Hitech City, Madhapur, Hyderabad (hereinafter referred to as the "Company");
      </p>
      <p style={s}>
        AND <b>{d.fullName.toUpperCase()}</b> (hereinafter referred to as the "Employee/Intern").
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
        Company. c) Not copy, reproduce, or store Confidential Information on any personal devices or in
        unauthorized locations. d) Take all reasonable measures to protect the secrecy of and avoid
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
      <div style={{ marginTop: 24, fontSize: 12, lineHeight: 2 }}>
        <div>For and on behalf of TechVitta: ______________________</div>
        <div style={{ marginTop: 12 }}>Employee/Intern: ______________________</div>
      </div>
    </Sheet>
  );

  return [offer, nda];
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
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

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
      internshipType: "Unpaid",
      stipend: "",
      commenceDate: format(new Date(), "yyyy-MM-dd"),
      offerDate: format(new Date(), "yyyy-MM-dd"),
    });
    setStep("form");
    setDialogOpen(true);
  };

  const setField = (key: keyof OfferData, value: string) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const pages = useMemo(
    () => (form ? (form.internshipType === "Paid" ? paidPages(form) : unpaidPages(form)) : []),
    [form],
  );

  const valid = form && form.fullName.trim() && form.email.trim();

  const makePdf = async (): Promise<{ blob: Blob; fileName: string }> => {
    if (!form) throw new Error("No data");
    const opts = { scale: 2, useCORS: true, backgroundColor: "#ffffff" as const };
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    const els = pageRefs.current.filter(Boolean) as HTMLDivElement[];
    if (els.length === 0) throw new Error("Nothing to render");
    for (let i = 0; i < els.length; i++) {
      const canvas = await html2canvas(els[i], opts);
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
    }
    const cleanName = form.fullName.replace(/[^a-zA-Z0-9]+/g, "");
    const fileName = `TechVitta_${form.internshipType}Internship_OfferLetter_${cleanName}_${format(
      new Date(form.offerDate || new Date()),
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
            positionTitle: "Intern",
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
        position: "Intern",
        department: candidate.jobs?.department || "IT",
        internship_type: form.internshipType,
        salary: form.internshipType === "Paid" ? form.stipend || null : null,
        start_date: form.commenceDate,
        end_date: form.commenceDate,
        manager_name: "HR Manager",
        joining_location: "Hyderabad",
        email: form.email,
        offer_letter_url: offerLetterUrl,
      });
      if (dbError) console.error("Failed to save offer letter record:", dbError);

      await supabase.from("candidates").update({ status: "Offer Released" }).eq("id", candidate.id);
      await supabase.from("activity_logs").insert({
        action: "OFFER_LETTER_GENERATED_SENT",
        details: `${form.internshipType} offer letter generated for ${form.fullName} (${form.email}). Email ${emailSent ? "sent" : "failed"}. File: ${fileName}`,
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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground truncate">{c.full_name}</p>
                  <FeedbackBadge decision={c.feedback_decision} rating={c.feedback_rating} />
                  <CidBadge status={c.document_verification_status} />
                </div>
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
                  Choose the internship type and confirm the name &amp; email. Everything else is fixed
                  on the official template. Nothing is sent until you preview and confirm.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label>Internship type</Label>
                <Select value={form.internshipType} onValueChange={(v) => setField("internshipType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Unpaid">Unpaid internship (detailed letter)</SelectItem>
                    <SelectItem value="Paid">Paid internship (offer + NDA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
                  <Label>Commencement date</Label>
                  <Input type="date" value={form.commenceDate} onChange={(e) => setField("commenceDate", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Offer date</Label>
                  <Input type="date" value={form.offerDate} onChange={(e) => setField("offerDate", e.target.value)} />
                </div>
                {form.internshipType === "Paid" && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Monthly stipend (optional)</Label>
                    <Input value={form.stipend} onChange={(e) => setField("stipend", e.target.value)} placeholder="e.g. ₹10,000" />
                  </div>
                )}
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
                <DialogTitle>
                  Preview — {form.internshipType} internship ({pages.length} page
                  {pages.length === 1 ? "" : "s"})
                </DialogTitle>
                <DialogDescription>This exact PDF will be emailed to {form.email}.</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col items-center gap-4">
                {pages.map((node, i) => (
                  <div
                    key={i}
                    className="border border-border shadow-md overflow-hidden"
                    style={{ width: SHEET_W * 0.5, height: SHEET_H * 0.5 }}
                  >
                    <div style={{ transform: "scale(0.5)", transformOrigin: "top left" }}>{node}</div>
                  </div>
                ))}
              </div>

              {/* Full-size hidden copies used for PDF capture */}
              <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
                {pages.map((node, i) => (
                  <div key={i} ref={(el) => (pageRefs.current[i] = el)}>
                    {node}
                  </div>
                ))}
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

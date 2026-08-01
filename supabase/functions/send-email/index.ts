// Supabase Edge Function: Send Email via Resend
// Sends emails to candidates for shortlisting, interviews, document requests, and offer letters

// @ts-ignore - Deno standard library import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore - Resend client for Deno via npm specifier
import { Resend } from "npm:resend@3.2.0";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Techvitta Innovations Pvt Ltd <hr@techvitta.in>";
// Candidates reply to this address. It MUST be a real, receivable mailbox —
// cms.techvitta.in has no MX records, so replies there bounce. techvitta.in is
// hosted on GoDaddy/Titan and receives mail, so replies land in the HR inbox.
const RESEND_REPLY_TO = Deno.env.get("RESEND_REPLY_TO") || "hr@techvitta.in";

interface EmailRequest {
  to: string;
  candidateName: string;
  emailType:
    | "shortlist"
    | "interview"
    | "documents"
    | "cid-document-request"
    | "offer-letter"
    | "reject"
    | "offer-letter-upload"
    | "experience-letter-upload"
    | "request-resume"
    | "document-rejection";
  data?: {
    companyName?: string;
    positionTitle?: string;
    // Interview details
    interviewDate?: string;
    interviewTime?: string;
    interviewMode?: string;
    interviewPanel?: string;
    interviewNotes?: string;
    interviewPanelLink?: string;
    locationDetails?: string;
    reportingInstructions?: string;
    documentsToBring?: string;
    panelRoomDetails?: string;
    // Offer letter
    jobTitle?: string;
    salary?: string;
    startDate?: string;
    endDate?: string;
    department?: string;
    internshipType?: string;
    managerName?: string;
    joiningLocation?: string;
    // Documents
    requiredDocuments?: string[];
    // CID Document Request
    uploadLink?: string;
    deadline?: string;
    // Rejection feedback
    feedbackNotes?: string;
    // Document rejection
    documentType?: string;
    // Attachment for uploaded offer letters
    attachment?: {
      filename: string;
      content: string; // base64 encoded file
      type: string; // MIME type
    };
    offer_letter_url?: string;
  };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Validate environment variables
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set in environment variables");
    return new Response(
      JSON.stringify({
        success: false,
        error: "RESEND_API_KEY is not set in environment variables",
      }),
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }

  try {
    // Parse request body with error handling
    let body: EmailRequest;
    try {
      body = await req.json() as EmailRequest;
    } catch (parseError: any) {
      console.error("Failed to parse request body:", parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid request body: " + (parseError.message || "Failed to parse JSON"),
        }),
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    const { to, candidateName, emailType, data } = body;

    if (!to || !candidateName || !emailType) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: to, candidateName, emailType",
        }),
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    // Generate email subject and content based on type
    let subject = "";
    let htmlContent = "";

    const companyName = data?.companyName || "Techvitta Innovations Pvt Ltd";

    switch (emailType) {
      case "shortlist": {
        const position = data?.positionTitle || "the role";
        subject = `You Have Been Shortlisted for the Next Round – ${position}`;
        htmlContent = `
          <p>Dear ${candidateName},</p>
          <p>We are pleased to inform you that you have been shortlisted for the <b>${position}</b> position at <b>${companyName}</b>. Your profile aligns well with our current requirements, and we would like to proceed with the next steps in the selection process.</p>
          <p>Our recruitment team will be scheduling the upcoming round shortly and will share the interview details with you soon.</p>
          <p>If you have any questions, please feel free to reach out.</p>
          <p>Warm regards,<br/>HR Team<br/>${companyName}</p>
        `;
        break;
      }

      case "interview": {
        const position = data?.positionTitle || "the role";
        const interviewDate = data?.interviewDate || "To be confirmed";
        const interviewTime = data?.interviewTime || "To be confirmed";
        const interviewMode = data?.interviewMode || "To be confirmed";
        const locationOrLink =
          interviewMode === "Offline"
            ? data?.locationDetails || "Location will be shared"
            : data?.interviewPanelLink || "Meeting link will be shared";
        const interviewer = data?.interviewPanel || "Interview Panel";

        subject = `Interview Invitation – ${position} – Scheduled on ${interviewDate}`;
        htmlContent = `
          <p>Dear ${candidateName},</p>
          <p>Thank you for your interest in the <b>${position}</b> role at <b>${companyName}</b>. We are pleased to invite you for an interview as part of the next stage in our hiring process.</p>
          <p><b>Interview Details:</b></p>
          <ul>
            <li><b>Date:</b> ${interviewDate}</li>
            <li><b>Time:</b> ${interviewTime}</li>
            <li><b>Mode:</b> ${interviewMode}</li>
            <li><b>Location / Meeting Link:</b> ${locationOrLink}</li>
            <li><b>Interviewer:</b> ${interviewer}</li>
          </ul>
          ${data?.reportingInstructions ? `<p><b>Reporting Instructions:</b> ${data.reportingInstructions}</p>` : ""}
          ${data?.documentsToBring ? `<p><b>Documents to Bring:</b> ${data.documentsToBring}</p>` : ""}
          ${data?.panelRoomDetails ? `<p><b>Panel / Room Details:</b> ${data.panelRoomDetails}</p>` : ""}
          <p>Please confirm your availability for the scheduled time by replying to this email.</p>
          <p>We look forward to speaking with you.</p>
          <p>Best regards,<br/>HR Team<br/>${companyName}</p>
        `;
        break;
      }

      case "documents": {
        const documentsList = data?.requiredDocuments?.length
          ? `<ul>${data.requiredDocuments.map((doc) => `<li>${doc}</li>`).join("")}</ul>`
          : `
            <ul>
              <li>Educational Credentials 10th to Highest</li>
              <li>Latest resume copy with local address</li>
              <li>ID proof (Aadhar Card & PAN Card)</li>
              <li>Professional / Course Certificates (if any)</li>
              <li>Previous offer letters & relieving letters / internship certificates</li>
            </ul>
          `;
        subject = "Documents Requested for Further Evaluation";
        htmlContent = `
          <p>Dear ${candidateName},</p>
          <p>Thank you for your interest in the position at ${companyName}. As part of the hiring process, we kindly request you to share the following documents for further evaluation:</p>
          ${documentsList}
          <p>Please ensure that all documents are either in PDF or JPEG format and clearly labelled with your name and the document type. You can attach them to this email or provide a secure file-sharing link if the files are too large for attachment.</p>
          <p>We appreciate your promptness as this will help us proceed with your application efficiently. If you have any questions or need clarification, feel free to reach out.</p>
          <p>HR Manager<br/>${companyName}<br/>3rd Floor, Plot No 19, Opp Cyber Pearl, Hitech City, Madhapur, Hyderabad, Telangana 500081.</p>
        `;
        break;
      }

      case "offer-letter": {
        const position = data?.positionTitle || data?.jobTitle || "the offered role";
        const department = data?.department ? `<li><b>Department:</b> ${data.department}</li>` : "";
        const internshipType = data?.internshipType || "Paid";
        const startDate = data?.startDate ? `<li><b>Start Date:</b> ${data.startDate}</li>` : "";
        const endDate = data?.endDate ? `<li><b>End Date:</b> ${data.endDate}</li>` : "";
        const manager = data?.managerName ? `<li><b>Reporting Manager:</b> ${data.managerName}</li>` : "";
        const location = data?.joiningLocation ? `<li><b>Joining Location:</b> ${data.joiningLocation}</li>` : "";
        const compensation =
          internshipType === "Paid" && data?.salary
            ? `<li><b>Compensation:</b> ${data.salary}</li>`
            : `<li><b>Compensation:</b> This internship is unpaid and offered for learning experience.</li>`;
        subject = `Offer Letter – ${internshipType} ${position}`;
        htmlContent = `
          <p>Dear ${candidateName},</p>
          <p>Congratulations! We are pleased to offer you a <b>${internshipType.toLowerCase()}</b> internship position as <b>${position}</b> at <b>${companyName}</b>.</p>
          <p>Please review the key details of your internship below:</p>
          <ul>
            ${department}
            ${startDate}
            ${endDate}
            ${manager}
            ${location}
            <li><b>Internship Type:</b> ${internshipType}</li>
            ${compensation}
          </ul>
          <p>Kindly confirm your acceptance by replying to this email. If you have any questions, feel free to reach out.</p>
          <p>Warm regards,<br/>HR Team<br/>${companyName}</p>
        `;
        break;
      }

      case "offer-letter-upload": {
        const positionTitle = data?.positionTitle || "Intern Position";
        subject = `Internship Offer Letter - ${positionTitle}`;
        htmlContent = `
          <div style="font-family: Arial; line-height:1.6; color:#222;">
            <p>Hello ${candidateName},</p>
            <p>We are pleased to inform you that you have been selected for the internship program at <b>${companyName}</b>.</p>
            <p>Please find attached your Offer Letter. We request you to review the document carefully and confirm your acceptance by replying to this email.</p>
            <p>We're excited to have you on board and look forward to seeing you contribute to our mission.</p>
            <p>Warm regards,<br/>HR Team<br/>${companyName}</p>
          </div>
        `;
        break;
      }

      case "experience-letter-upload": {
        subject = `Experience Letter – Issued for Your Employment at ${companyName}`;
        htmlContent = `
          <div style="font-family: Arial; line-height:1.6; color:#222;">
            <p>Dear ${candidateName},</p>
            <p>We hope you are doing well.</p>
            <p>This email is to inform you that your Experience Letter from <b>${companyName}</b> has been successfully prepared.</p>
            <p>Please find the attached document, which includes details of your employment, role, tenure, responsibilities, and conduct during your association with our organization.</p>
            <p>If you require any additional clarification or supporting documents, please feel free to reach out to the HR team, and we will be happy to assist you.</p>
            <p>Warm regards,<br/><br/>HR Team<br/><b>${companyName}</b></p>
          </div>
        `;
        break;
      }

      case "reject": {
        const position = data?.positionTitle || "the role";
        subject = `Update on Your Application – ${position}`;
        htmlContent = `
          <p>Dear ${candidateName},</p>
          <p>Thank you for taking the time to participate in our recruitment process for the <b>${position}</b> role at <b>${companyName}</b>. After careful evaluation, we regret to inform you that we will not be moving forward with your application at this time.</p>
          ${data?.feedbackNotes ? `<p><b>Feedback:</b> ${data.feedbackNotes}</p>` : ""}
          <p>We truly appreciate your interest in our organization and the effort you invested throughout the process. We encourage you to apply again for future opportunities that match your skills and experience.</p>
          <p>Wishing you success in your career ahead.</p>
          <p>Sincerely,<br/>HR Team<br/>${companyName}</p>
        `;
        break;
      }

      case "request-resume": {
        const resumeUploadLink = data?.uploadLink || "";
        subject = `Request to Upload Your Updated Resume – ${companyName}`;
        htmlContent = `
          <p>Dear ${candidateName},</p>
          <p>We hope you are doing well.</p>
          <p>As part of the recruitment process at <b>${companyName}</b>, we request you to share your latest and updated resume so that we can proceed with the next steps of your application.</p>
          ${resumeUploadLink
            ? `
          <p style="text-align:center;margin:24px 0;">
            <a href="${resumeUploadLink}" style="background:#4f46e5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Upload Your Resume</a>
          </p>
          <p>Click the button above to upload your resume (PDF) — it attaches to your application automatically. If the button doesn't work, open this link:<br/><a href="${resumeUploadLink}">${resumeUploadLink}</a></p>
          <p>You can also reply to this email with your resume attached instead.</p>`
            : `
          <p>Please reply to this email with your resume attached in PDF format, or share a secure link from where we can download it.</p>`}
          <p>If you have already shared your resume recently, you can ignore this message.</p>
          <p>Warm regards,<br/>HR Team<br/>${companyName}</p>
        `;
        break;
      }

      case "cid-document-request": {
        const positionTitle = data?.positionTitle || "the role";
        const uploadLink = data?.uploadLink || "#";
        const deadline = data?.deadline || "7 days from today";
        
        const documentsList = data?.requiredDocuments?.length
          ? `<ul>${data.requiredDocuments.map((doc: string) => `<li>${doc}</li>`).join("")}</ul>`
          : `
            <ul>
              <li>Educational Credentials 10th to Highest</li>
              <li>Latest resume copy (Updated) with local address</li>
              <li>ID proof (Aadhar Card & PAN Card) for KYC</li>
              <li>Professional / Course Certificates (If Any)</li>
              <li>Previous offer letters & relieving letters, internship certificates</li>
            </ul>
          `;

        subject = `Documents Required – ${positionTitle}`;

        htmlContent = `
          <div style="font-family: Arial; line-height:1.6; color:#222;">
            <p>Dear ${candidateName},</p>
            <p>
              Thank you for your interest for the position of <b>${positionTitle}</b> (paid/unpaid) at our company.
              As part of the hiring process, we kindly request you to share the following
              documents with us for further evaluation:
            </p>
            ${documentsList}
            <p>
              Please ensure all documents are either in PDF or JPEG format and clearly
              labelled with your name and document type.
            </p>
            <p style="background-color: #f0f9ff; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
              <b>📎 UPLOAD LINK:</b><br/>
              <a href="${uploadLink}" style="color: #3b82f6; word-break: break-all; font-size: 14px;">${uploadLink}</a>
            </p>
            <p><b>⏰ DEADLINE:</b> ${deadline}</p>
            <p>
              We appreciate your promptness in providing these documents as they will enable
              us to proceed with the evaluation process effectively.
            </p>
            <p>If you have any questions, feel free to reach out.</p>
            <p>
              HR Manager<br/>
              Techvitta Innovations Pvt Ltd<br/>
              Address: 3rd Floor, Plot No 19, Opp Cyber Pearl, Hitech City, Madhapur,
              Hyderabad, Telangana 500081.
            </p>
          </div>
        `;
        break;
      }

      case "document-rejection": {
        const uploadLink = data?.uploadLink || "#";
        const feedbackNotes = data?.feedbackNotes || "The documents provided do not meet the standard identification requirements as outlined by Techvitta Innovations Pvt. Ltd. for onboarding purposes.";
        const documentType = data?.documentType || "identification documents";

        subject = `Request for Resubmission of Identification Documents`;

        htmlContent = `
          <div style="font-family: Arial; line-height:1.6; color:#222;">
            <p><b>Subject: Request for Resubmission of Identification Documents</b></p>
            <p>******</p>
            <p>Dear ${candidateName},</p>
            <p>
              Thank you for submitting your identification documents following your interview selection.
            </p>
            <p>
              After reviewing the documents shared through the submission portal, we would like to inform you that the <b>${documentType}</b> provided do not meet the standard identification requirements as outlined by <b>Techvitta Innovations Pvt. Ltd.</b> for onboarding purposes.
            </p>
            <p>
              To proceed further, we kindly request you to resubmit valid and acceptable identification documents in accordance with the company's standard terms and requirements mentioned earlier. Please ensure that the documents are:
            </p>
            <ul>
              <li>Clearly readable</li>
              <li>Valid and up to date</li>
              <li>Submitted in the prescribed format</li>
              <li>Aligned with the identification standards specified by the company</li>
            </ul>
            ${feedbackNotes ? `
            <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: #991b1b;">Feedback / Reason for Rejection:</p>
              <p style="margin: 5px 0 0 0; color: #7f1d1d;">${feedbackNotes}</p>
            </div>
            ` : ""}
            <p style="background-color: #f0f9ff; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
              <b>📎 UPLOAD LINK:</b><br/>
              <a href="${uploadLink}" style="color: #3b82f6; word-break: break-all; font-size: 14px; text-decoration: underline;">${uploadLink}</a>
            </p>
            <p>
              Once the correct documents are received and verified, we will be able to move forward with the next steps of the onboarding process.
            </p>
            <p>
              If you have any questions regarding the acceptable documents or require clarification on the requirements, please feel free to reach out.
            </p>
            <p>
              Thank you for your cooperation and understanding. We look forward to receiving the revised documents at the earliest.
            </p>
            <p>
              Warm regards,<br/>
              Asif P<br/>
              Manager - Quality Assurance,<br/>
              TechVitta Innovations Pvt Ltd.<br/>
              HiTech City, Hyderabad.
            </p>
          </div>
        `;
        break;
      }

      default:
        throw new Error(`Unknown email type: ${emailType}`);
    }

    // Send email via Resend SDK
    console.log("Sending email via Resend...", { to, subject, emailType });
    const resend = new Resend(RESEND_API_KEY);
    
    const emailPayload: any = {
      from: RESEND_FROM_EMAIL,
      to: to,
      // Send replies to the real HR mailbox, not the no-MX app subdomain.
      reply_to: RESEND_REPLY_TO,
      subject: subject,
      html: htmlContent,
    };

    // Add attachment if provided (for offer-letter-upload or experience-letter-upload types)
    if ((emailType === "offer-letter-upload" || emailType === "experience-letter-upload") && data?.attachment) {
      emailPayload.attachments = [
        {
          filename: data.attachment.filename,
          content: data.attachment.content, // base64 string
          type: data.attachment.type || "application/pdf",
        },
      ];
      console.log("Email will include attachment:", data.attachment.filename);
    }

    const result = await resend.emails.send(emailPayload);
    console.log("Resend API response:", JSON.stringify(result, null, 2));

    if (result.error) {
      console.error("Resend API error:", result.error);
      throw new Error(`Failed to send email: ${result.error.message || JSON.stringify(result.error)}`);
    }

    if (!result.data || !result.data.id) {
      console.error("Unexpected Resend response:", result);
      throw new Error("Email sending returned unexpected response");
    }

    console.log("EMAIL SENT SUCCESS - Email ID:", result.data.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email sent successfully to ${to}`,
        emailId: result.data.id,
      }),
      {
        status: 200,
        headers: corsHeaders(),
      }
    );
  } catch (error: any) {
    console.error("Error sending email:", error);
    console.error("Error details:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Failed to send email",
        details: error?.stack || undefined,
      }),
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }
});

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}





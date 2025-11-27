import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Techvitta Innovations Pvt Ltd <hr@cms.techvitta.in>";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders()
    });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");

    const body = await req.json();

    const resend = new Resend(RESEND_API_KEY);

    const candidate = body.candidateName || "Candidate";

    const company = "Techvitta Innovations Pvt Ltd";

    const position = "Intern"; // Always INTERN

    let subject = "";

    let htmlContent = "";

    // -----------------------------------------------------------
    // SHORTLIST TEMPLATE
    // -----------------------------------------------------------
    if (body.emailType === "shortlist") {
      subject = `You Have Been Shortlisted for the Next Round – ${position}`;

      htmlContent = `
        <div style="font-family: Arial; line-height:1.6; color:#222;">
          <p>Dear ${candidate},</p>
          <p>
          We are pleased to inform you that you have been shortlisted for the
          <b>${position}</b> position at <b>${company}</b>. Your profile aligns
          well with our current requirements, and we would like to proceed with the
          next steps in the selection process.
          </p>
          <p>
          Our recruitment team will be scheduling the upcoming round shortly and
          will share the interview details with you soon.
          </p>
          <p>If you have any questions, please feel free to reach out.</p>
          <p>Warm regards,<br/>HR Team<br/>${company}</p>
        </div>
      `;
    }

    // -----------------------------------------------------------
    // INTERVIEW TEMPLATE
    // -----------------------------------------------------------
    if (body.emailType === "interview") {
      subject = `Interview Invitation – ${position} – Scheduled on ${body.data?.interviewDate}`;

      htmlContent = `
        <div style="font-family: Arial; line-height:1.6; color:#222;">
          <p>Dear ${candidate},</p>
          <p>
          Thank you for your interest in the <b>${position}</b> role at
          <b>${company}</b>. We are pleased to invite you for an interview as part of
          the next stage in our hiring process.
          </p>
          <p><b>Interview Details:</b></p>
          <ul>
            <li><b>Date:</b> ${body.data?.interviewDate}</li>
            <li><b>Time:</b> ${body.data?.interviewTime}</li>
            <li><b>Mode:</b> ${body.data?.interviewMode}</li>
            <li><b>Location / Meeting Link:</b> ${body.data?.interviewPanelLink}</li>
            <li><b>Interviewer:</b> ${body.data?.interviewPanel}</li>
          </ul>
          <p>We look forward to speaking with you.</p>
          <p>Best regards,<br/>HR Team<br/>${company}</p>
        </div>
      `;
    }

    // -----------------------------------------------------------
    // DOCUMENTS TEMPLATE
    // -----------------------------------------------------------
    if (body.emailType === "documents") {
      subject = `Documents Required – ${position}`;

      htmlContent = `
        <div style="font-family: Arial; line-height:1.6; color:#222;">
          <p>Dear ${candidate},</p>
          <p>
          Thank you for your interest for the position of <b>${position}</b> (paid/unpaid) at our company.
          As part of the hiring process, we kindly request you to share the following
          documents with us for further evaluation:
          </p>
          <ul>
            <li>Educational Credentials 10th to Highest</li>
            <li>Latest resume copy (Updated) with local address</li>
            <li>ID proof (Aadhar Card & PAN Card) for KYC</li>
            <li>Professional / Course Certificates (If Any)</li>
            <li>Previous offer letters & relieving letters, internship certificates</li>
          </ul>
          <p>
          Please ensure all documents are either in PDF or JPEG format and clearly
          labelled with your name and document type.
          </p>
          <p>
          We appreciate your promptness in providing these documents as they will enable
          us to proceed with the evaluation process effectively.
          </p>
          <p>If you have any questions, feel free to reach out.</p>
          <p>
          HR Manager<br/>
          Techvitta Innovations Pvt Ltd<br/>
          Address: 3rd Floor, Plot No 19, Opp Cyber Pearl, Hitech City, Madhapur, Hyderabad, Telangana 500081.
          </p>
        </div>
      `;
    }

    // -----------------------------------------------------------
    // REJECTION TEMPLATE
    // -----------------------------------------------------------
    if (body.emailType === "reject") {
      subject = `Update on Your Application – ${position}`;

      htmlContent = `
        <div style="font-family: Arial; line-height:1.6; color:#222;">
          <p>Dear ${candidate},</p>
          <p>
          Thank you for taking the time to participate in our recruitment process
          for the <b>${position}</b> role at <b>${company}</b>. After careful
          evaluation, we regret to inform you that we will not be moving forward
          with your application at this time.
          </p>
          <p>
          We truly appreciate your interest and the effort you invested throughout
          the process. We encourage you to apply again for future opportunities
          that match your skills and experience.
          </p>
          <p>Wishing you success in your career ahead.</p>
          <p>Sincerely,<br/>HR Team<br/>${company}</p>
        </div>
      `;
    }

    // -----------------------------------------------------------
    // OFFER LETTER UPLOAD TEMPLATE (NEW - FOR MANUAL UPLOADS)
    // -----------------------------------------------------------
    if (body.emailType === "offer-letter-upload") {
      const positionTitle = body.data?.positionTitle || position;

      subject = `Internship Offer Letter - ${positionTitle}`;

      htmlContent = `
        <div style="font-family: Arial; line-height:1.6; color:#222;">
          <p>Hello ${candidate},</p>
          <p>We are pleased to inform you that you have been selected for the internship program at <b>${company}</b>.</p>
          <p>Please find attached your Offer Letter. We request you to review the document carefully and confirm your acceptance by replying to this email.</p>
          <p>We're excited to have you on board and look forward to seeing you contribute to our mission.</p>
          <p>Warm regards,<br/>HR Team<br/>${company}</p>
        </div>
      `;
    }

    // -----------------------------------------------------------
    // EXPERIENCE LETTER UPLOAD TEMPLATE (NEW - FOR MANUAL UPLOADS)
    // -----------------------------------------------------------
    if (body.emailType === "experience-letter-upload") {
      subject = `Experience Letter – Issued for Your Employment at ${company}`;

      htmlContent = `
        <div style="font-family: Arial; line-height:1.6; color:#222;">
          <p>Dear ${candidate},</p>
          <p>We hope you are doing well.</p>
          <p>This email is to inform you that your Experience Letter from <b>${company}</b> has been successfully prepared.</p>
          <p>Please find the attached document, which includes details of your employment, role, tenure, responsibilities, and conduct during your association with our organization.</p>
          <p>If you require any additional clarification or supporting documents, please feel free to reach out to the HR team, and we will be happy to assist you.</p>
          <p>Warm regards,<br/><br/>HR Team<br/><b>${company}</b></p>
        </div>
      `;
    }

    // -----------------------------------------------------------
    // SEND EMAIL
    // -----------------------------------------------------------
    const emailPayload: any = {
      from: RESEND_FROM_EMAIL,
      to: body.to || body.candidateEmail,
      subject: subject,
      html: htmlContent
    };

    // Add attachment if provided (for offer-letter-upload or experience-letter-upload types)
    if ((body.emailType === "offer-letter-upload" || body.emailType === "experience-letter-upload") && body.data?.attachment) {
      emailPayload.attachments = [
        {
          filename: body.data.attachment.filename,
          content: body.data.attachment.content,
          type: body.data.attachment.type || "application/pdf"
        }
      ];
      console.log("Email will include attachment:", body.data.attachment.filename);
    }

    const result = await resend.emails.send(emailPayload);

    return new Response(JSON.stringify({
      success: true,
      result
    }), {
      status: 200,
      headers: corsHeaders()
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
});

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info"
  };
}



// Supabase Edge Function: send-documents
// Sends document request emails via Resend
// @ts-ignore Deno standard library import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore Resend client import
import { Resend } from "npm:resend@3.2.0";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") || "HireQuest <onboarding@resend.dev>";

interface DocumentsPayload {
  to: string;
  candidateName: string;
  companyName?: string;
  requiredDocuments?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders(),
    });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");

    const payload = (await req.json()) as DocumentsPayload;
    if (!payload.to || !payload.candidateName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: to, candidateName",
        }),
        { status: 400, headers: corsHeaders() }
      );
    }

    const company = payload.companyName || "Techvitta Innovations Pvt Ltd";
    const docs =
      payload.requiredDocuments?.length
        ? payload.requiredDocuments
        : [
            "Educational Credentials (10th to highest)",
            "Latest resume with local address",
            "ID Proof (Aadhar & PAN)",
            "Professional / Course Certificates (if any)",
            "Previous offer letters / relieving letters / internship certificates",
          ];

    const subject = "Documents Requested for Further Evaluation";
    const html = `
      <p>Dear ${payload.candidateName},</p>
      <p>Thank you for your interest in the position at <b>${company}</b>. Please share the following documents for further evaluation:</p>
      <ul>${docs.map((doc) => `<li>${doc}</li>`).join("")}</ul>
      <p>Please ensure the documents are in PDF or JPEG format, clearly labelled with your name. Attach them to this email or share via a secure link.</p>
      <p>Best regards,<br/>HR Manager<br/>${company}<br/>3rd Floor, Plot No 19, Opp Cyber Pearl, Hitech City, Madhapur, Hyderabad 500081</p>
    `;

    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: payload.to,
      subject,
      html,
    });

    if (error) {
      throw new Error(error.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: data?.id ?? null,
      }),
      { status: 200, headers: corsHeaders() }
    );
  } catch (error) {
    console.error("send-documents error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message ?? "Failed to send email",
      }),
      { status: 500, headers: corsHeaders() }
    );
  }
});

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, apikey, x-client-info",
  };
}


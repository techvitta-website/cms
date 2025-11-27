// Supabase Edge Function: send-reject
// Sends rejection notification emails via Resend
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

interface RejectPayload {
  to: string;
  candidateName: string;
  companyName?: string;
  positionTitle?: string;
  feedbackNotes?: string;
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

    const payload = (await req.json()) as RejectPayload;
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
    const position = payload.positionTitle || "the role";

    const subject = `Update on Your Application – ${position}`;
    const html = `
      <p>Dear ${payload.candidateName},</p>
      <p>Thank you for your interest in the <b>${position}</b> role at <b>${company}</b> and for the time you invested in our recruitment process.</p>
      <p>After careful consideration, we regret to inform you that we will not be moving forward with your application at this time.</p>
      ${
        payload.feedbackNotes
          ? `<p><b>Feedback:</b> ${payload.feedbackNotes}</p>`
          : ""
      }
      <p>We truly appreciate your interest and encourage you to stay connected with us for future opportunities.</p>
      <p>Sincerely,<br/>HR Team<br/>${company}</p>
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
    console.error("send-reject error:", error);
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


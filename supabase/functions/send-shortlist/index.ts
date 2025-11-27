// Supabase Edge Function: send-shortlist
// Sends shortlist notification emails via Resend
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

interface ShortlistPayload {
  to: string;
  candidateName: string;
  positionTitle?: string;
  companyName?: string;
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

    const payload = (await req.json()) as ShortlistPayload;
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

    const subject = `You Have Been Shortlisted for the Next Round – ${position}`;
    const html = `
      <p>Dear ${payload.candidateName},</p>
      <p>We are pleased to inform you that you have been shortlisted for the <b>${position}</b> position at <b>${company}</b>. Your profile aligns well with our current requirements, and we would like to proceed with the next steps.</p>
      <p>Our recruitment team will schedule the next round shortly and share the interview details with you.</p>
      <p>Warm regards,<br/>HR Team<br/>${company}</p>
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
    console.error("send-shortlist error:", error);
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


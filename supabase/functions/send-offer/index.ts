// Supabase Edge Function: send-offer
// Sends offer letter notification emails via Resend
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

interface OfferPayload {
  to: string;
  candidateName: string;
  companyName?: string;
  jobTitle?: string;
  salary?: string;
  startDate?: string;
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

    const payload = (await req.json()) as OfferPayload;
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
    const jobTitle = payload.jobTitle || "the offered role";

    const subject = `Offer Letter – ${jobTitle}`;
    const html = `
      <p>Dear ${payload.candidateName},</p>
      <p>Congratulations! You have been selected for the position of <b>${jobTitle}</b> at <b>${company}</b>.</p>
      ${payload.salary ? `<p><b>Salary:</b> ${payload.salary}</p>` : ""}
      ${payload.startDate ? `<p><b>Proposed Start Date:</b> ${payload.startDate}</p>` : ""}
      <p>Your offer letter is now available. Please review it and let us know if you have any questions.</p>
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
    console.error("send-offer error:", error);
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


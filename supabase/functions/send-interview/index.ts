// Supabase Edge Function: send-interview
// Sends interview invitation emails via Resend
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

interface InterviewPayload {
  to: string;
  candidateName: string;
  positionTitle?: string;
  companyName?: string;
  interviewDate?: string;
  interviewTime?: string;
  interviewMode?: string;
  interviewPanel?: string;
  interviewPanelLink?: string;
  locationDetails?: string;
  reportingInstructions?: string;
  documentsToBring?: string;
  panelRoomDetails?: string;
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

    const payload = (await req.json()) as InterviewPayload;
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
    const date = payload.interviewDate || "To be confirmed";
    const time = payload.interviewTime || "To be confirmed";
    const mode = payload.interviewMode || "To be confirmed";
    const locationOrLink =
      mode === "Offline"
        ? payload.locationDetails || "Location will be shared"
        : payload.interviewPanelLink || "Meeting link will be shared";
    const interviewer = payload.interviewPanel || "Interview Panel";

    const subject = `Interview Invitation – ${position} – Scheduled on ${date}`;
    const html = `
      <p>Dear ${payload.candidateName},</p>
      <p>Thank you for your interest in the <b>${position}</b> role at <b>${company}</b>. We are pleased to invite you for an interview.</p>
      <p><b>Interview Details:</b></p>
      <ul>
        <li><b>Date:</b> ${date}</li>
        <li><b>Time:</b> ${time}</li>
        <li><b>Mode:</b> ${mode}</li>
        <li><b>Location / Meeting Link:</b> ${locationOrLink}</li>
        <li><b>Interviewer:</b> ${interviewer}</li>
      </ul>
      ${payload.reportingInstructions ? `<p><b>Reporting Instructions:</b> ${payload.reportingInstructions}</p>` : ""}
      ${payload.documentsToBring ? `<p><b>Documents to Bring:</b> ${payload.documentsToBring}</p>` : ""}
      ${payload.panelRoomDetails ? `<p><b>Panel / Room Details:</b> ${payload.panelRoomDetails}</p>` : ""}
      <p>Please confirm your availability by replying to this email.</p>
      <p>Best regards,<br/>HR Team<br/>${company}</p>
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
    console.error("send-interview error:", error);
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


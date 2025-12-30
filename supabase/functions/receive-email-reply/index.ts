// Supabase Edge Function: Receive Email Replies via Resend Webhook
// Receives email replies from candidates and stores them in the database

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ResendWebhookPayload {
  type: "email.received";
  data: {
    id: string;
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    created_at: string;
    in_reply_to?: string; // Original email ID that was replied to
    headers?: Record<string, string>;
  };
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// Determine email stage based on subject or in_reply_to
async function determineEmailStage(
  subject: string,
  inReplyTo: string | undefined,
  supabaseClient: ReturnType<typeof createClient>
): Promise<string | null> {
  const subjectLower = subject.toLowerCase();

  // Check subject for keywords
  if (subjectLower.includes("shortlist") || subjectLower.includes("shortlisted")) {
    return "shortlist";
  }
  if (subjectLower.includes("interview") || subjectLower.includes("scheduled")) {
    return "interview";
  }
  if (subjectLower.includes("document") || subjectLower.includes("documents")) {
    return "feedback";
  }
  if (subjectLower.includes("offer") || subjectLower.includes("offer letter")) {
    return "offer-letter";
  }
  if (subjectLower.includes("experience") || subjectLower.includes("experience letter")) {
    return "experience-letter";
  }

  // If we have in_reply_to, try to find the original email in activity_logs
  if (inReplyTo) {
    const { data: logs } = await supabaseClient
      .from("activity_logs")
      .select("action, details")
      .ilike("details", `%${inReplyTo}%`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (logs && logs.length > 0) {
      const action = logs[0].action;
      if (action.includes("SHORTLIST")) return "shortlist";
      if (action.includes("INTERVIEW")) return "interview";
      if (action.includes("DOCUMENTS")) return "feedback";
      if (action.includes("OFFER")) return "offer-letter";
      if (action.includes("EXPERIENCE")) return "experience-letter";
    }
  }

  return null; // Unknown stage
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders(),
    });
  }

  try {
    // Verify webhook secret if provided
    if (RESEND_WEBHOOK_SECRET) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${RESEND_WEBHOOK_SECRET}`) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          {
            status: 401,
            headers: corsHeaders(),
          }
        );
      }
    }

    const payload: ResendWebhookPayload = await req.json();

    if (payload.type !== "email.received") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid webhook type" }),
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    const { data } = payload;
    const fromEmail = data.from.toLowerCase().trim();
    const subject = data.subject || "";
    const replyContent = data.text || data.html || "";
    const inReplyTo = data.in_reply_to;

    // Find candidate by email
    const { data: candidate, error: candidateError } = await supabase
      .from("candidates")
      .select("id, full_name, email")
      .ilike("email", fromEmail)
      .maybeSingle();

    if (candidateError) {
      console.error("Error finding candidate:", candidateError);
    }

    // Determine email stage
    const emailStage = await determineEmailStage(subject, inReplyTo, supabase);

    // Store the email reply
    const { error: insertError } = await supabase.from("email_replies").insert({
      candidate_id: candidate?.id || null,
      candidate_email: fromEmail,
      candidate_name: candidate?.full_name || fromEmail.split("@")[0],
      subject: subject,
      reply_content: replyContent,
      original_email_id: inReplyTo || null,
      reply_email_id: data.id,
      email_stage: emailStage,
      received_at: data.created_at,
      status: "unread",
      metadata: {
        headers: data.headers || {},
        html_content: data.html || null,
      },
    });

    if (insertError) {
      console.error("Error storing email reply:", insertError);
      throw insertError;
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      action: "EMAIL_REPLY_RECEIVED",
      details: `Email reply received from ${candidate?.full_name || fromEmail} (${emailStage || "unknown"}): ${subject.substring(0, 50)}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email reply stored successfully",
      }),
      {
        status: 200,
        headers: corsHeaders(),
      }
    );
  } catch (error: any) {
    console.error("Error processing email reply:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to process email reply",
      }),
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }
});













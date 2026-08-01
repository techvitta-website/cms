// Supabase Edge Function: Delete HR User
// Allows admin users to permanently remove an HR user's login access:
// deletes their hr_users row AND their Supabase Auth account.
//
// The SSO hub (logins.techvitta.in) reads each app's users live by email,
// so a deletion here automatically disappears from the SSO console — no
// changes to the Master project / sso repo are needed.

// @ts-ignore - Deno standard library import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore - Supabase client for Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
});

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders(),
    });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authorization header required" }),
        {
          status: 401,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client with user's token
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get current user
    const {
      data: { user: currentUser },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !currentUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Check if current user is admin
    const { data: hrUser, error: hrError } = await supabaseClient
      .from("hr_users")
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (hrError || !hrUser || hrUser.role?.toLowerCase() !== "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Only admin users can delete HR users" }),
        {
          status: 403,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "User ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Block self-delete — an admin removing their own login would lock
    // themselves (and possibly everyone) out.
    if (userId === currentUser.id) {
      return new Response(
        JSON.stringify({ success: false, error: "You cannot delete your own account" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Verify target user exists
    const { data: targetUser, error: targetError } = await supabaseClient
      .from("hr_users")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (targetError || !targetUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Target user not found" }),
        {
          status: 404,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Use service role for the privileged deletes (bypasses RLS + Auth admin API)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1) Remove the application row (roles / directory entry)
    const { error: rowError } = await supabaseAdmin
      .from("hr_users")
      .delete()
      .eq("id", userId);

    if (rowError) {
      console.error("hr_users delete error:", rowError);
      return new Response(
        JSON.stringify({ success: false, error: rowError.message || "Failed to remove HR user record" }),
        {
          status: 500,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // 2) Remove the auth login itself so they can no longer sign in anywhere.
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      // The directory row is already gone; report the partial failure so the
      // admin knows the auth login may still exist and can retry.
      console.error("auth deleteUser error:", authDeleteError);
      return new Response(
        JSON.stringify({
          success: false,
          error:
            authDeleteError.message ||
            "Removed the HR record but failed to delete the login account. Please retry.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "HR user deleted successfully",
        userId,
      }),
      {
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "An unexpected error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      }
    );
  }
});

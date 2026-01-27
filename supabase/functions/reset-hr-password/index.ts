// Supabase Edge Function: Reset HR User Password
// Allows admin users to reset passwords for HR users

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
        JSON.stringify({ success: false, error: "Only admin users can reset passwords" }),
        {
          status: 403,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "User ID and new password are required" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: "Password must be at least 6 characters" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Verify target user exists and is HR role
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

    // Only allow resetting passwords for HR role users (not other admins)
    if (targetUser.role?.toLowerCase() === "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot reset password for admin users" }),
        {
          status: 403,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    // Use service role to update password (admin operation)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) {
      console.error("Password reset error:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message || "Failed to reset password" }),
        {
          status: 500,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password reset successfully",
        userId: data.user.id,
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




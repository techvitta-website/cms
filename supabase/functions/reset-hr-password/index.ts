// Supabase Edge Function: Reset HR User Password
// Allows admin users to reset passwords for HR users.
//
// IMPORTANT: in this project hr_users.id does NOT always equal auth.users.id
// (roles are keyed by email). So everything here keys off EMAIL:
//   - the caller's admin status is looked up by their auth email
//   - the target's auth account is resolved from their email via the
//     get_auth_user_id_by_email() helper (service-role only)
// Matching on hr_users.id would 403 a legitimate admin and would update the
// wrong/nonexistent auth account for users whose ids diverge.

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Authorization header required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // Client bound to the caller's token — used only to identify the caller.
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service-role client — used for all privileged reads/writes.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Identify the caller from their JWT.
    const {
      data: { user: currentUser },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !currentUser || !currentUser.email) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const callerEmail = currentUser.email.toLowerCase();

    // Verify the caller is an admin — looked up BY EMAIL (hr_users.id may not
    // match the auth id, so we cannot match on id here).
    const { data: callerRows, error: callerError } = await supabaseAdmin
      .from("hr_users")
      .select("role")
      .ilike("email", callerEmail)
      .limit(1);

    const callerRole = callerRows?.[0]?.role;
    if (callerError || !callerRole || callerRole.toLowerCase() !== "admin") {
      return json({ success: false, error: "Only admin users can reset passwords" }, 403);
    }

    // Parse request body
    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return json({ success: false, error: "User ID and new password are required" }, 400);
    }

    if (newPassword.length < 6) {
      return json({ success: false, error: "Password must be at least 6 characters" }, 400);
    }

    // Load the target row (by hr_users.id) to get their email and role.
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("hr_users")
      .select("id, email, role")
      .eq("id", userId)
      .single();

    if (targetError || !targetUser || !targetUser.email) {
      return json({ success: false, error: "Target user not found" }, 404);
    }

    // Only allow resetting passwords for HR role users (not other admins).
    if (targetUser.role?.toLowerCase() === "admin") {
      return json({ success: false, error: "Cannot reset password for admin users" }, 403);
    }

    // Resolve the target's real auth user id from their email.
    const { data: authUserId, error: rpcError } = await supabaseAdmin.rpc(
      "get_auth_user_id_by_email",
      { p_email: targetUser.email }
    );

    if (rpcError) {
      console.error("get_auth_user_id_by_email error:", rpcError);
      return json(
        { success: false, error: rpcError.message || "Failed to resolve login account" },
        500
      );
    }

    if (!authUserId) {
      return json(
        { success: false, error: "No login account found for this user" },
        404
      );
    }

    // Use service role to update the password (admin operation).
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      authUserId as string,
      { password: newPassword }
    );

    if (error) {
      console.error("Password reset error:", error);
      return json(
        { success: false, error: error.message || "Failed to reset password" },
        500
      );
    }

    return json({
      success: true,
      message: "Password reset successfully",
      userId: data.user.id,
    });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return json(
      { success: false, error: error.message || "An unexpected error occurred" },
      500
    );
  }
});

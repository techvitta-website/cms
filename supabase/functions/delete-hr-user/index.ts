// Supabase Edge Function: Delete HR User
// Allows admin users to permanently remove an HR user's login access:
// deletes their hr_users row AND their Supabase Auth account.
//
// IMPORTANT: in this project hr_users.id does NOT always equal auth.users.id
// (roles are keyed by email). So everything here keys off EMAIL:
//   - the caller's admin status is looked up by their auth email
//   - the target's auth account is resolved from their email via the
//     get_auth_user_id_by_email() helper (service-role only)
// Using the hr_users.id as an auth id would silently target the wrong account.
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
    // Get authorization header
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

    // Service-role client — used for all privileged reads/writes so we are not
    // subject to RLS and can reach the auth admin API.
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
      return json({ success: false, error: "Only admin users can delete HR users" }, 403);
    }

    // Parse request body — userId is the hr_users row id sent by the client.
    const { userId } = await req.json();
    if (!userId) {
      return json({ success: false, error: "User ID is required" }, 400);
    }

    // Load the target row (by hr_users.id) to get their email.
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("hr_users")
      .select("id, email, role")
      .eq("id", userId)
      .single();

    if (targetError || !targetUser || !targetUser.email) {
      return json({ success: false, error: "Target user not found" }, 404);
    }

    // Block self-delete — compare by EMAIL (ids can differ from auth ids).
    if (targetUser.email.toLowerCase() === callerEmail) {
      return json({ success: false, error: "You cannot delete your own account" }, 400);
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

    // Delete the auth login FIRST so we never end up with a removed directory
    // row while the login still works. If there is no auth account (already
    // gone), skip straight to removing the orphaned hr_users row.
    if (authUserId) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
        authUserId as string
      );
      if (authDeleteError) {
        console.error("auth deleteUser error:", authDeleteError);
        return json(
          {
            success: false,
            error: authDeleteError.message || "Failed to delete the login account.",
          },
          500
        );
      }
    }

    // Remove the application row (roles / directory entry).
    const { error: rowError } = await supabaseAdmin
      .from("hr_users")
      .delete()
      .eq("id", userId);

    if (rowError) {
      console.error("hr_users delete error:", rowError);
      return json(
        {
          success: false,
          error:
            rowError.message ||
            "Deleted the login account but failed to remove the HR record.",
        },
        500
      );
    }

    return json({ success: true, message: "HR user deleted successfully", userId });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return json(
      { success: false, error: error.message || "An unexpected error occurred" },
      500
    );
  }
});

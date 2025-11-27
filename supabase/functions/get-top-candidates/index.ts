// Supabase Edge Function: Get Top Candidates API
// Returns top 5 candidates ordered by score descending

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get limit from query params or request body, default to 5
    let limit = 5;
    
    if (req.method === "GET") {
      const url = new URL(req.url);
      const limitParam = url.searchParams.get("limit");
      if (limitParam) {
        limit = parseInt(limitParam, 10);
      }
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.limit) {
        limit = parseInt(String(body.limit), 10);
      }
    }
    
    // Ensure limit is valid
    limit = Math.min(Math.max(1, limit), 100); // Between 1 and 100

    // Fetch top candidates ordered by score
    const { data: topCandidates, error } = await supabase
      .from("resume_scores")
      .select("*")
      .order("score", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch candidates: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        count: topCandidates?.length || 0,
        candidates: topCandidates || [],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});


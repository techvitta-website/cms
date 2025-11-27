// Supabase Edge Function: AI-Powered Resume Matcher
// Processes PDFs from storage, extracts data with OpenAI, saves to resume_scores table

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const JOB_REQUIREMENT = Deno.env.get("JOB_REQUIREMENT") || `We are looking for a skilled software engineer with:
- Strong programming skills (JavaScript, TypeScript, Python, or similar)
- Experience with modern frameworks (React, Node.js, or similar)
- Database knowledge (PostgreSQL, MongoDB, or similar)
- 3+ years of professional experience
- Excellent problem-solving abilities`;

interface ResumeScore {
  file_name: string;
  name: string;
  skills: string[];
  score: number;
}

/**
 * Extract text from PDF using pdf.js via esm.sh (Deno-compatible)
 */
async function extractTextFromPDF(pdfBytes: Uint8Array): Promise<string> {
  try {
    // Import pdfjs-dist via esm.sh for Deno compatibility
    const pdfjsLib = await import("https://esm.sh/pdfjs-dist@3.11.174");
    
    // Configure worker (use CDN for worker)
    pdfjsLib.GlobalWorkerOptions.workerSrc = 
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs";

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes,
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded: ${pdf.numPages} pages`);
    
    let fullText = "";
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine all text items
      const pageText = textContent.items
        .map((item: any) => item.str || "")
        .join(" ");
      
      fullText += pageText + "\n\n";
    }
    
    const trimmedText = fullText.trim();
    console.log(`Extracted ${trimmedText.length} characters from PDF`);
    
    if (trimmedText.length < 50) {
      throw new Error("PDF appears to contain no readable text (possibly scanned image)");
    }
    
    return trimmedText;
  } catch (error: any) {
    console.error("Error extracting PDF text:", error);
    throw new Error(`Failed to extract PDF text: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Analyze resume with OpenAI and extract structured data
 */
async function analyzeResumeWithOpenAI(
  resumeText: string,
  jobRequirement: string
): Promise<ResumeScore> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const prompt = `Analyze this resume and compare it to the job requirements below.

Job Requirements:
${jobRequirement}

Resume Text:
${resumeText.substring(0, 8000)}

Extract the candidate's name, skills (as an array), and calculate a match score (0-100) based on how well the resume matches the job requirements.

Return ONLY valid JSON in this exact format:
{
  "name": "Full Name from Resume",
  "skills": ["skill1", "skill2", "skill3"],
  "score": 85
}`;

  let lastError: Error | null = null;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an expert resume analyzer. Extract candidate information and calculate match scores. Always return valid JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error("No content in OpenAI response");
      }

      // Parse JSON response
      const parsed = JSON.parse(content.trim());

      return {
        name: parsed.name || "Unknown",
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        score: Math.min(100, Math.max(0, parsed.score || 0)),
      };
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        // Exponential backoff: wait 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Process a single PDF file from storage
 */
async function processResumeFile(
  supabase: any,
  fileName: string
): Promise<ResumeScore | null> {
  try {
    console.log(`Processing: ${fileName}`);

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("resumes")
      .download(fileName);

    if (downloadError) {
      console.error(`Failed to download ${fileName}:`, downloadError);
      return null;
    }

    // Convert blob to Uint8Array
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);

    // Extract text from PDF
    const resumeText = await extractTextFromPDF(pdfBytes);
    
    if (!resumeText || resumeText.trim().length < 50) {
      console.warn(`No text extracted from ${fileName}`);
      return null;
    }

    console.log(`Extracted ${resumeText.length} characters from ${fileName}`);

    // Analyze with OpenAI
    const analysis = await analyzeResumeWithOpenAI(resumeText, JOB_REQUIREMENT);

    return {
      file_name: fileName,
      ...analysis,
    };
  } catch (error) {
    console.error(`Error processing ${fileName}:`, error);
    return null;
  }
}

/**
 * Main Edge Function handler
 */
serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

    // List all PDF files from storage bucket
    const { data: files, error: listError } = await supabase.storage
      .from("resumes")
      .list("", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (listError) {
      throw new Error(`Failed to list files: ${listError.message}`);
    }

    if (!files || files.length === 0) {
      return new Response(
        JSON.stringify({ message: "No PDF files found in storage bucket" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Filter PDF files only
    const pdfFiles = files.filter((f: any) =>
      f.name.toLowerCase().endsWith(".pdf")
    );

    if (pdfFiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "No PDF files found in storage bucket" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    console.log(`Found ${pdfFiles.length} PDF files to process`);

    // Process each PDF file
    const results: ResumeScore[] = [];
    
    for (const file of pdfFiles) {
      const result = await processResumeFile(supabase, file.name);
      if (result) {
        results.push(result);
      }
    }

    if (results.length === 0) {
      return new Response(
        JSON.stringify({ message: "No valid results generated from PDFs" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Save results to resume_scores table
    const recordsToInsert = results.map((result) => ({
      file_name: result.file_name,
      name: result.name,
      skills: result.skills,
      score: result.score,
    }));

    // Delete existing records for these files (avoid duplicates)
    const fileNames = recordsToInsert.map((r) => r.file_name);
    await supabase
      .from("resume_scores")
      .delete()
      .in("file_name", fileNames);

    // Insert new records
    const { error: insertError } = await supabase
      .from("resume_scores")
      .insert(recordsToInsert);

    if (insertError) {
      throw new Error(`Failed to insert results: ${insertError.message}`);
    }

    // Fetch top 5 results ordered by score
    const { data: topCandidates, error: fetchError } = await supabase
      .from("resume_scores")
      .select("*")
      .order("score", { ascending: false })
      .limit(5);

    if (fetchError) {
      throw new Error(`Failed to fetch results: ${fetchError.message}`);
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} resumes successfully`,
        processed: results.length,
        topCandidates: topCandidates || [],
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


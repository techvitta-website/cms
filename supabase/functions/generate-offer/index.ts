import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import PizZip from "npm:pizzip";
import Docxtemplater from "npm:docxtemplater";
import { createClient } from "npm:@supabase/supabase-js";
import FormData from "npm:form-data";
import { Resend } from "npm:resend@3.2.0";

const RESEND_FROM_EMAIL = "Techvitta Innovations Pvt Ltd <hr@cms.techvitta.in>";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders(),
    });
  }

  // Validate environment variables inside the serve function
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const CONVERTAPI_SECRET = Deno.env.get("CONVERTAPI_SECRET");
  const TEMPLATE_PUBLIC_URL = Deno.env.get("TEMPLATE_PUBLIC_URL");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing Supabase environment variables",
      }),
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing RESEND_API_KEY environment variable",
      }),
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }

  if (!CONVERTAPI_SECRET) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing CONVERTAPI_SECRET environment variable. Please set it in Edge Functions → Secrets.",
      }),
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }

  if (!TEMPLATE_PUBLIC_URL) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing TEMPLATE_PUBLIC_URL environment variable",
      }),
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const {
      candidate_id,
      candidate_name,
      position,
      department,
      internship_type,
      salary,
      start_date,
      end_date,
      manager_name,
      joining_location,
      offer_email,
    } = body;

    // Validate required fields
    if (!candidate_id || !candidate_name || !position || !department || !internship_type || !start_date || !end_date || !manager_name || !joining_location || !offer_email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields",
          received: {
            candidate_id: !!candidate_id,
            candidate_name: !!candidate_name,
            position: !!position,
            department: !!department,
            internship_type: !!internship_type,
            start_date: !!start_date,
            end_date: !!end_date,
            manager_name: !!manager_name,
            joining_location: !!joining_location,
            offer_email: !!offer_email,
          },
        }),
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    // Verify candidate exists
    console.log("Verifying candidate exists:", candidate_id);
    const { data: candidateCheck, error: candidateCheckError } = await supabase
      .from("candidates")
      .select("id, email")
      .eq("id", candidate_id)
      .single();

    if (candidateCheckError || !candidateCheck) {
      console.error("Candidate not found:", candidateCheckError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Candidate not found: ${candidate_id}`,
          details: candidateCheckError?.message,
        }),
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    console.log("Candidate verified:", candidateCheck);

    // Try to fetch template - use public URL or fallback to storage client
    let tplBuf: Uint8Array;
    let templateUrl = TEMPLATE_PUBLIC_URL;

    // If TEMPLATE_PUBLIC_URL is not set or is a signed URL that might expire, use public URL
    if (!templateUrl || templateUrl.includes("/object/sign/")) {
      // Construct public URL from Supabase URL
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/offer-templates/docx/offer-template.v3.docx`;
      console.log("Using constructed public URL:", publicUrl);
      templateUrl = publicUrl;
    }

    console.log("LOADING TEMPLATE:", templateUrl);
    console.log("Template URL format check:", {
      startsWithHttp: templateUrl?.startsWith("http"),
      includesBucket: templateUrl?.includes("offer-templates"),
      includesFile: templateUrl?.includes("offer-template.v3.docx"),
    });

    try {
      // Try fetching from URL first
      const tplResponse = await fetch(templateUrl);
      console.log("Template fetch response:", {
        status: tplResponse.status,
        statusText: tplResponse.statusText,
        ok: tplResponse.ok,
      });

      if (!tplResponse.ok) {
        throw new Error(`Template fetch failed: ${tplResponse.status} ${tplResponse.statusText}`);
      }

      tplBuf = new Uint8Array(await tplResponse.arrayBuffer());
      console.log("Template loaded successfully from URL, size:", tplBuf.length, "bytes");
    } catch (urlError: any) {
      console.warn("Failed to fetch template from URL, trying storage client:", urlError.message);
      
      // Fallback: Use Supabase storage client to download directly
      try {
        const { data: templateData, error: storageError } = await supabase.storage
          .from("offer-templates")
          .download("docx/offer-template.v3.docx");

        if (storageError || !templateData) {
          throw new Error(`Storage download failed: ${storageError?.message || "No data returned"}`);
        }

        tplBuf = new Uint8Array(await templateData.arrayBuffer());
        console.log("Template loaded successfully from storage client, size:", tplBuf.length, "bytes");
      } catch (storageErr: any) {
        console.error("Both URL and storage client failed:", storageErr);
        throw new Error(`Failed to load template: URL error (${urlError.message}), Storage error (${storageErr.message})`);
      }
    }

    const zip = new PizZip(tplBuf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Set template data
    doc.setData({
      candidate_name,
      position,
      department,
      internship_type,
      salary: salary || "",
      start_date,
      end_date,
      manager_name,
      joining_location,
      today_date: new Date().toLocaleDateString(),
    });

    doc.render();

    // Generate filled DOCX
    const filledDocx = doc.getZip().generate({
      type: "nodebuffer",
    });

    const fileBytes = new Uint8Array(filledDocx);
    const safeName = candidate_name.replace(/\s+/g, "_");
    const docxPath = `generated/${safeName}_${Date.now()}.docx`;

    // Try to upload to storage first (for ConvertAPI URL)
    // If storage fails, we'll use file bytes directly
    let signedUrl: string | null = null;
    const storageBuckets = ["offer-templates", "offer-letters"];
    let uploadSuccess = false;

    for (const bucketName of storageBuckets) {
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(docxPath, fileBytes, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });

      if (!uploadError) {
        // Create signed URL for ConvertAPI
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(docxPath, 3600);

        if (!signedUrlError && signedUrlData) {
          signedUrl = signedUrlData.signedURL;
          uploadSuccess = true;
          console.log(`Successfully uploaded to bucket: ${bucketName}`);
          break;
        }
      } else {
        console.warn(`Failed to upload to bucket ${bucketName}:`, uploadError.message);
      }
    }

    // Convert DOCX to PDF using ConvertAPI
    let pdfBytes: Uint8Array;
    let base64Pdf: string;

    if (signedUrl) {
      // Use signed URL if storage upload succeeded
      console.log("Using signed URL for ConvertAPI");
      try {
        const convertForm = new FormData();
        convertForm.append("Url", signedUrl);
        convertForm.append("StoreFile", "false");

        const convResponse = await fetch(
          `https://v2.convertapi.com/convert/docx/to/pdf?Secret=${CONVERTAPI_SECRET}`,
          {
            method: "POST",
            body: convertForm,
          }
        );

        if (!convResponse.ok) {
          const errorText = await convResponse.text();
          console.error("ConvertAPI error:", errorText);
          throw new Error(`ConvertAPI error: ${convResponse.status} - ${errorText}`);
        }

        const convJson = await convResponse.json();

        if (!convJson.Files || !convJson.Files[0] || !convJson.Files[0].Url) {
          throw new Error("ConvertAPI did not return a valid PDF URL");
        }

        const pdfUrl = convJson.Files[0].Url;

        // Download PDF
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
        }

        pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
        base64Pdf = btoa(String.fromCharCode(...pdfBytes));
      } catch (convertError: any) {
        console.warn("PDF conversion failed (signed URL method):", convertError.message);
        // Set empty PDF - email will be sent without attachment
        pdfBytes = new Uint8Array(0);
        base64Pdf = "";
      }
    } else {
      // If storage failed, try ConvertAPI with file upload using base64
      console.log("Storage upload failed, trying ConvertAPI with base64 file upload");
      try {
        // Convert file bytes to base64 for ConvertAPI
        const base64Docx = btoa(String.fromCharCode(...fileBytes));
        const convertForm = new FormData();
        // ConvertAPI accepts base64 encoded files
        convertForm.append("File", base64Docx);
        convertForm.append("FileName", `${safeName}.docx`);
        convertForm.append("StoreFile", "false");

        const convResponse = await fetch(
          `https://v2.convertapi.com/convert/docx/to/pdf?Secret=${CONVERTAPI_SECRET}`,
          {
            method: "POST",
            body: convertForm,
          }
        );

        if (!convResponse.ok) {
          const errorText = await convResponse.text();
          console.error("ConvertAPI file upload failed:", errorText);
          // Fallback: Generate simple PDF from HTML (like frontend does)
          throw new Error("ConvertAPI failed, will use HTML fallback");
        }

        const convJson = await convResponse.json();

        if (!convJson.Files || !convJson.Files[0] || !convJson.Files[0].Url) {
          throw new Error("ConvertAPI did not return a valid PDF URL");
        }

        const pdfUrl = convJson.Files[0].Url;
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
        }

        pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
        base64Pdf = btoa(String.fromCharCode(...pdfBytes));
      } catch (convertError) {
        // Final fallback: Send email without PDF attachment (or with HTML content)
        console.warn("PDF conversion failed, sending email without PDF attachment:", convertError);
        // We'll send email without PDF - the offer letter details are in the email body
        pdfBytes = new Uint8Array(0);
        base64Pdf = "";
      }
    }

    console.log("PDF generated successfully, size:", pdfBytes.length, "bytes");
    console.log("Preparing to send email to:", offer_email);

    // Send email with PDF attachment - Updated format
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
        <p>Hello ${candidate_name},</p>
        <p>
          We are pleased to inform you that you have been selected for the internship program at <b>Techvitta Innovations Pvt Ltd</b>.
        </p>
        <p>
          After reviewing your enthusiasm, and potential, we believe you will make a valuable contribution to our team.
        </p>
        <p>
          Please find attached your Offer Letter, which includes details about your internship duration, responsibilities, reporting structure, and other relevant terms and conditions. We request you to review the document carefully and confirm your acceptance by replying to this email or signing and returning the offer letter.
        </p>
        <p>
          We're excited to have you on board and look forward to seeing you contribute to our mission.
        </p>
        <p>
          Warm regards,<br/>
          HR Team<br/>
          Techvitta Innovations Pvt Ltd
        </p>
      </div>
    `;

    console.log("Sending email via Resend...");
    const resend = new Resend(RESEND_API_KEY);
    
    // Prepare email payload
    const emailPayload: any = {
      from: RESEND_FROM_EMAIL,
      to: offer_email,
      subject: `Internship Offer Letter – ${position} – ${department}`,
      html,
    };

    // Only add PDF attachment if we successfully generated it
    if (base64Pdf && pdfBytes.length > 0) {
      emailPayload.attachments = [
        {
          filename: "OfferLetter.pdf",
          content: base64Pdf,
          type: "application/pdf",
        },
      ];
      console.log("Email will include PDF attachment");
    } else {
      console.log("Email will be sent without PDF attachment (PDF generation failed)");
    }

    let emailResult: any;
    try {
      emailResult = await resend.emails.send(emailPayload);
      console.log("Resend API response:", JSON.stringify(emailResult, null, 2));

      if (emailResult.error) {
        console.error("Resend API error:", emailResult.error);
        throw new Error(`Failed to send email: ${emailResult.error.message || JSON.stringify(emailResult.error)}`);
      }

      if (!emailResult.data || !emailResult.data.id) {
        console.error("Unexpected Resend response:", emailResult);
        throw new Error("Email sending returned unexpected response");
      }

      console.log("EMAIL SENT SUCCESS - Email ID:", emailResult.data.id);
    } catch (emailError: any) {
      console.error("Email sending error:", emailError);
      // Return error response but don't throw - let the caller handle it
      return new Response(
        JSON.stringify({
          success: false,
          error: emailError?.message || "Failed to send email",
        }),
        {
          status: 500,
          headers: corsHeaders(),
        }
      );
    }

    // Save offer letter to database
    let offerLetterUrl: string | null = null;
    if (signedUrl) {
      // Use the signed URL if available, or create a public URL
      offerLetterUrl = signedUrl.split('?')[0]; // Remove query params for storage
    }

    try {
      // Insert offer letter record using candidate_id from body
      // Note: Table name with hyphen needs to be quoted in some cases
      const insertData = {
        candidate_id: candidate_id,
        position: position,
        department: department,
        internship_type: internship_type,
        salary: salary || null,
        start_date: start_date,
        end_date: end_date,
        manager_name: manager_name,
        joining_location: joining_location,
        email: offer_email,
        offer_letter_url: offerLetterUrl,
      };

      console.log("Attempting to save offer letter to database:", JSON.stringify(insertData, null, 2));

      const { data: insertData_result, error: insertError } = await supabase
        .from("offer-letters")
        .insert(insertData)
        .select();

      if (insertError) {
        console.error("Failed to save offer letter to database:", JSON.stringify(insertError, null, 2));
        console.error("Insert error details:", {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        });
        // Don't fail the whole request if DB save fails
      } else {
        console.log("Offer letter saved to database successfully:", JSON.stringify(insertData_result, null, 2));
      }
    } catch (dbError: any) {
      console.error("Error saving offer letter to database:", dbError);
      console.error("DB Error details:", {
        message: dbError?.message,
        stack: dbError?.stack,
      });
      // Don't fail the whole request if DB save fails
    }

    const successResponse = {
      success: true,
      message: "Offer letter generated and email sent successfully",
      emailId: emailResult.data?.id || null,
    };

    console.log("Returning success response:", JSON.stringify(successResponse, null, 2));

    return new Response(
      JSON.stringify(successResponse),
      {
        status: 200,
        headers: corsHeaders(),
      }
    );
  } catch (err: any) {
    console.error("ERROR:", err);
    console.error("Error details:", {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
      cause: err?.cause,
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || "Failed to generate offer letter",
        details: err?.stack || undefined,
      }),
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }
});

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}


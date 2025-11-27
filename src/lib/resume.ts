import { supabase } from "@/integrations/supabase/client";

type BucketPath = {
  bucket: string;
  path: string;
};

const STORAGE_PATH_REGEX = /storage\/v1\/object\/([^/]+)\/(.+)$/i;
// Try resumes-private first since that's where most resumes are stored
const DEFAULT_BUCKET_CANDIDATES = ["resumes-private", "resumes"];

function cleanup(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();
  if (!trimmed) return null;
  return trimmed.split("?")[0] ?? trimmed;
}

function parseBucketPath(reference: string): BucketPath | null {
  const cleaned = cleanup(reference);
  if (!cleaned) return null;

  // Pattern 1: Full Supabase storage URL
  const httpMatch = cleaned.match(STORAGE_PATH_REGEX);
  if (httpMatch) {
    return {
      bucket: decodeURIComponent(httpMatch[1]),
      path: decodeURIComponent(httpMatch[2]),
    };
  }

  // Pattern 2: URL with /object/ path
  const objectMatch = cleaned.match(/\/object\/([^/]+)\/(.+)$/i);
  if (objectMatch) {
    return {
      bucket: decodeURIComponent(objectMatch[1]),
      path: decodeURIComponent(objectMatch[2]),
    };
  }

  // Pattern 3: Simple path format (bucket/path or just path)
  // Handle formats like: "resumes-private/filename.pdf" or "bucket/path/to/file.pdf"
  const noProtocol = cleaned.replace(/^https?:\/\//i, "");
  const segments = decodeURIComponent(noProtocol)
    .replace(/^sign\//, "")
    .split("/")
    .filter(Boolean);

  if (segments.length >= 2) {
    // First segment is likely the bucket name
    const bucket = segments[0];
    const path = segments.slice(1).join("/");
    return { bucket, path };
  }

  // Pattern 4: Check if it's a known bucket name followed by filename
  // Handle formats like: "resumes-private/filename.pdf" when split incorrectly
  const knownBuckets = ['resumes-private', 'resumes', 'resume'];
  for (const bucket of knownBuckets) {
    if (cleaned.startsWith(bucket + '/') || cleaned.startsWith(bucket + '\\')) {
      const path = cleaned.substring(bucket.length + 1);
      return { bucket, path };
    }
  }

  // Pattern 5: Just a filename (will be handled by filename extraction logic)
  if (segments.length === 1 && segments[0].endsWith('.pdf')) {
    return null;
  }

  return null;
}

function generateBucketPathCandidates(reference: string): BucketPath[] {
  const combos: BucketPath[] = [];
  const seen = new Set<string>();

  const direct = parseBucketPath(reference);
  if (direct) {
    combos.push(direct);
    seen.add(`${direct.bucket}|${direct.path}`);
  }

  const cleaned = cleanup(reference);
  if (!cleaned) return combos;

  const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET as string | undefined;
  const bucketCandidates = new Set(DEFAULT_BUCKET_CANDIDATES);
  if (envBucket) bucketCandidates.add(envBucket);

  const possiblePaths = new Set<string>();
  
  // Add direct path if available
  if (direct) {
    possiblePaths.add(direct.path);
  }
  
  // Parse segments from cleaned reference
  const rawSegments = decodeURIComponent(cleaned).split("/").filter(Boolean);
  
  // Handle format: "resumes-private/filename.pdf" or "bucket/path/to/file.pdf"
  if (rawSegments.length >= 2) {
    // Check if first segment is a known bucket
    const knownBuckets = ['resumes-private', 'resumes', 'resume'];
    if (knownBuckets.includes(rawSegments[0].toLowerCase())) {
      // First segment is bucket, rest is path
      possiblePaths.add(rawSegments.slice(1).join("/"));
    } else {
      // Full path without first segment (assuming first might be bucket)
      possiblePaths.add(rawSegments.slice(1).join("/"));
    }
    // Just the last segment (filename)
    possiblePaths.add(rawSegments[rawSegments.length - 1]);
  } else if (rawSegments.length === 1) {
    // Single segment - could be just filename
    possiblePaths.add(rawSegments[0]);
  }
  
  // Add the full cleaned path (but only if it doesn't start with a bucket name)
  const fullPath = decodeURIComponent(cleaned);
  if (!fullPath.match(/^(resumes-private|resumes|resume)[\/\\]/i)) {
    possiblePaths.add(fullPath);
  }
  
  // Extract filename patterns (e.g., 1762419453817_0_filename.pdf)
  const filenameMatch = cleaned.match(/(\d+_\d+_[^\/]+\.pdf)$/i);
  if (filenameMatch && filenameMatch[1]) {
    possiblePaths.add(filenameMatch[1]);
  }
  
  // Extract any .pdf filename from the end
  const pdfMatch = cleaned.match(/([^\/]+\.pdf)$/i);
  if (pdfMatch && pdfMatch[1]) {
    possiblePaths.add(pdfMatch[1]);
  }

  // Generate all bucket/path combinations
  for (const bucket of bucketCandidates) {
    for (const path of possiblePaths) {
      if (!bucket || !path) continue;
      const key = `${bucket}|${path}`;
      if (seen.has(key)) continue;
      combos.push({ bucket, path });
      seen.add(key);
    }
  }

  return combos;
}

export async function openResume(resumeReference: string) {
  if (!resumeReference || !resumeReference.trim()) {
    console.error("❌ Empty resume reference");
    return;
  }

  const cleaned = cleanup(resumeReference);
  if (!cleaned) {
    console.error("❌ Could not clean resume reference:", resumeReference);
    return;
  }

  console.log("📄 Attempting to open resume:", cleaned);

  const candidates = generateBucketPathCandidates(cleaned);
  console.log("🔍 Generated", candidates.length, "bucket/path candidates");

  // Try each candidate bucket/path combination
  for (const candidate of candidates) {
    try {
      // Clean the path - remove any leading slashes or bucket names
      let cleanPath = candidate.path;
      if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
      if (cleanPath.startsWith(candidate.bucket + '/')) {
        cleanPath = cleanPath.substring(candidate.bucket.length + 1);
      }
      
      console.log(`  Trying: ${candidate.bucket}/${cleanPath}`);
      const { data, error } = await supabase.storage
        .from(candidate.bucket)
        .createSignedUrl(cleanPath, 60 * 60);
      
      if (!error && data?.signedUrl) {
        console.log("✅ Success! Opening:", data.signedUrl);
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        return;
      } else if (error) {
        // Don't log "Object not found" for every attempt, only log other errors
        if (!error.message.includes("not found") && !error.message.includes("Object not found")) {
          console.log(`  ❌ Error with ${candidate.bucket}/${cleanPath}:`, error.message);
        }
      }
    } catch (err: any) {
      console.log(`  ❌ Exception with ${candidate.bucket}/${candidate.path}:`, err?.message);
      // Continue to next candidate
    }
  }

  // If all signed URL attempts failed, try to extract filename and try direct access
  console.log("⚠️ All signed URL attempts failed, trying direct filename extraction");
  
  // Try to extract just the filename from various formats
  const filenamePatterns = [
    /(\d+_\d+_[^\/]+\.pdf)$/i, // Pattern like: 1762419453817_0_filename.pdf (most specific)
    /([^\/\\]+\.pdf)$/i, // Handle backslashes too
    /([^\/]+\.pdf)$/i,  // Extract filename.pdf from end of path
  ];

  for (const pattern of filenamePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const filename = match[1];
      console.log(`  Trying with extracted filename: ${filename}`);
      
      // Try each bucket with just the filename (prioritize resumes-private)
      const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET as string | undefined;
      const bucketCandidates = Array.from(new Set(['resumes-private', envBucket, 'resumes'].filter(Boolean)));
      
      for (const bucket of bucketCandidates) {
        try {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(filename, 60 * 60);
          
          if (!error && data?.signedUrl) {
            console.log(`✅ Success with filename in ${bucket}!`);
            window.open(data.signedUrl, "_blank", "noopener,noreferrer");
            return;
          } else if (error && !error.message.includes("not found")) {
            console.log(`  Error in ${bucket}:`, error.message);
          }
        } catch (err: any) {
          if (!err?.message?.includes("not found")) {
            console.log(`  Exception in ${bucket}:`, err?.message);
          }
        }
      }
    }
  }

  // Final fallback: Show error message instead of trying to open as route
  console.error("❌ All methods failed to open resume:", cleaned);
  
  // Try to provide helpful information
  const extractedFilename = cleaned.match(/([^\/]+\.pdf)$/i)?.[1] || "unknown";
  console.error("📋 Extracted filename:", extractedFilename);
  console.error("💡 Suggestion: Check if the file exists in Supabase Storage bucket 'resumes-private'");
  
  alert(`Unable to open resume.\n\nResume reference: ${cleaned}\nExtracted filename: ${extractedFilename}\n\nPossible issues:\n1. File doesn't exist in Supabase Storage\n2. File is in a different bucket\n3. Incorrect file path\n\nPlease check the browser console (F12) for detailed error messages.`);
}


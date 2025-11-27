/**
 * PDF Text Extractor Utility
 * Extracts text from PDF files stored in Supabase storage or local files
 */

import * as pdfjsLib from "pdfjs-dist";
// Inline worker bundled by Vite for reliable dev/prod loading
import PdfJsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { SupabaseClient } from "@supabase/supabase-js";

const WORKER_CANDIDATES: string[] = [
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`,
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`,
];

let activeWorkerPort: Worker | null = null;

const setWorkerSrc = (src: string) => {
  if (activeWorkerPort) {
    activeWorkerPort.terminate();
    activeWorkerPort = null;
  }
  // Ensure workerPort is cleared when falling back to workerSrc mode
  (pdfjsLib.GlobalWorkerOptions as any).workerPort = null;
  pdfjsLib.GlobalWorkerOptions.workerSrc = src;
  console.log(`📦 PDF.js workerSrc configured: ${src}`);
};

const configureInlineWorker = () => {
  if (typeof window === "undefined") return false;
  try {
    const workerInstance = new (PdfJsWorker as unknown as new () => Worker)();
    (pdfjsLib.GlobalWorkerOptions as any).workerPort = workerInstance;
    activeWorkerPort = workerInstance;
    pdfjsLib.GlobalWorkerOptions.workerSrc = undefined as any;
    console.log("📦 PDF.js inline worker configured via Vite bundle");
    return true;
  } catch (error) {
    console.warn("⚠️ Failed to configure inline PDF.js worker, will try CDN fallbacks", error);
    return false;
  }
};

const inlineWorkerReady = configureInlineWorker();

if (!inlineWorkerReady && WORKER_CANDIDATES.length > 0) {
  setWorkerSrc(WORKER_CANDIDATES[0]);
}

/**
 * Extract text from a PDF stored in Supabase Storage (handles private buckets)
 */
export async function extractTextFromSupabaseStorage(
  supabase: SupabaseClient,
  bucketName: string,
  filePath: string
): Promise<string> {
  try {
    console.log(`📥 Downloading PDF from storage: ${bucketName}/${filePath}`);
    
    // Download directly from Supabase storage (handles private buckets with auth)
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (error) {
      throw new Error(`Failed to download PDF from storage: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from storage');
    }

    // Convert blob to array buffer
    const arrayBuffer = await data.arrayBuffer();
    return await extractTextFromPDFBuffer(arrayBuffer);
  } catch (error: any) {
    console.error('❌ Error extracting text from Supabase storage:', error);
    throw error;
  }
}

/**
 * Extract text from a PDF file URL (public URLs only - use extractTextFromSupabaseStorage for private buckets)
 */
export async function extractTextFromPDFUrl(pdfUrl: string): Promise<string> {
  try {
    console.log('📥 Downloading PDF from:', pdfUrl);
    
    // Fetch the PDF file (only works for public URLs)
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return await extractTextFromPDFBuffer(arrayBuffer);
  } catch (error) {
    console.error('❌ Error extracting text from PDF URL:', error);
    throw error;
  }
}

/**
 * Extract text from a PDF file buffer
 */
export async function extractTextFromPDFBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    console.log(`📄 PDF loaded: ${pdf.numPages} page(s)`);

    let fullText = "";

    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Combine all text items from this page
      const pageText = textContent.items.map((item: any) => item.str).join(" ");

      fullText += pageText + "\n\n";
    }

    console.log(`✅ Extracted ${fullText.length} characters from PDF`);
    return fullText.trim();
  } catch (error: any) {
    const isWorkerError =
      error?.message?.toLowerCase().includes("worker") ||
      error?.message?.toLowerCase().includes("failed to fetch");

    if (isWorkerError) {
      const currentIndex = WORKER_CANDIDATES.findIndex(
        (src) => src === pdfjsLib.GlobalWorkerOptions.workerSrc,
      );
      const nextCandidates = WORKER_CANDIDATES.slice(currentIndex + 1);

      for (const candidate of nextCandidates) {
        try {
          console.warn(`❌ Worker failed, trying fallback: ${candidate}`);
          setWorkerSrc(candidate);

          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          let fullText = "";
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(" ");
            fullText += pageText + "\n\n";
          }
          console.log(`✅ PDF extracted using fallback worker`);
          return fullText.trim();
        } catch (fallbackError) {
          console.warn(`⚠️ Worker fallback failed: ${fallbackError}`);
          continue;
        }
      }
      throw new Error(
        `PDF extraction failed: All worker sources failed. Last error: ${error?.message}`,
      );
    }

    console.error("❌ Error extracting text from PDF buffer:", error);
    throw error;
  }
}

/**
 * Extract text from a local File object
 */
export async function extractTextFromPDFFile(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    return await extractTextFromPDFBuffer(arrayBuffer);
  } catch (error) {
    console.error('❌ Error extracting text from PDF file:', error);
    throw error;
  }
}


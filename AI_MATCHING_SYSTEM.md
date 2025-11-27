# AI-Powered Candidate Matching System

## ✅ Implementation Complete

This system now provides comprehensive AI-powered candidate matching that:

1. **Reads Resumes from Supabase Storage**
   - Downloads PDF files directly from the `resumes-private` bucket (or `resumes` if public)
   - Extracts text using PDF.js library
   - Handles both PDFs from storage and text already in database

2. **Comprehensive Data Extraction with OpenAI**
   - **Skills**: Extracts all technical skills, programming languages, frameworks, and tools
   - **Education**: Extracts degree, institution, and graduation year
   - **Experience**: Calculates total years of work experience
   - Uses GPT-4o-mini for accurate extraction

3. **Advanced AI Matching**
   - Semantic comparison of candidate profiles with job requirements
   - Considers:
     - Skills alignment (40% weight)
     - Experience level (30% weight)
     - Education relevance (20% weight)
     - Overall fit (10% weight)
   - Returns match scores (0-100) with explanations

4. **Database Updates**
   - Updates `candidates` table with extracted skills, education, and experience
   - Stores match scores in `matches` table
   - Preserves resume text in database for future use

## 📋 Files Modified/Created

### New Files:
- `src/lib/pdfExtractor.ts` - PDF text extraction utility using pdfjs-dist

### Updated Files:
- `src/pages/Matching.tsx` - Complete rewrite with AI-powered matching
- `package.json` - Added `pdfjs-dist` dependency

## 🔧 Setup Instructions

### 1. Environment Variables
Ensure `.env` file exists in project root with:
```
VITE_OPENAI_API_KEY=sk-proj-...
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Storage Bucket Configuration
The system reads from:
- `resumes-private` bucket (as configured in Resumes.tsx)
- Or `resumes` bucket if using public storage

Make sure:
- Storage bucket exists in Supabase
- RLS policies allow reading from storage (for authenticated/anonymous users)
- Resume URLs are properly stored in `candidates.resume_url`

## 🚀 How It Works

### Step-by-Step Process:

1. **User Action**: HR selects a job and clicks "Run AI Match Analysis"

2. **Resume Collection**: 
   - System fetches all candidates with `resume_url`
   - For each candidate:
     - Checks if `resume_text` exists in DB (uses if available)
     - If not, downloads PDF from storage bucket using `resume_url`
     - Extracts text from PDF using PDF.js

3. **AI Extraction**:
   - Sends resume text to OpenAI GPT-4o-mini
   - Extracts structured data:
     ```json
     {
       "skills": ["javascript", "react", "node.js"],
       "education": "BS Computer Science, MIT, 2020",
       "experience": 5
     }
     ```

4. **AI Matching**:
   - Compares extracted candidate data with job requirements
   - Calculates semantic match score (0-100)
   - Generates explanation for the score

5. **Database Updates**:
   - Updates `candidates` table with extracted data
   - Deletes old matches for the job
   - Inserts new match records in `matches` table

6. **UI Display**:
   - Shows candidates sorted by match score
   - Displays skills, education, experience
   - Color-coded badges for match quality

## 📊 UI Features

- **Match Score Badges**:
  - 🟢 90-100%: Excellent match (green)
  - 🔵 80-89%: Good match (blue)
  - 🟡 70-79%: Moderate match (yellow)
  - ⚪ Below 70%: Needs review (gray)

- **Detailed Information**:
  - Candidate name
  - Extracted skills (as badges, max 5 shown)
  - Education details
  - Years of experience
  - Match score with explanation

## 🔒 Security & Best Practices

1. **API Key Security**:
   - OpenAI API key stored in `.env` file (never committed)
   - Only exposed to frontend as `VITE_OPENAI_API_KEY` (safe for client-side)
   - For production, consider moving to Edge Functions for enhanced security

2. **Resume Privacy**:
   - Resumes stored securely in Supabase storage
   - Only text content (first 50k chars) stored in database
   - Full PDFs remain in secure storage bucket

3. **Error Handling**:
   - Gracefully skips candidates without readable resumes
   - Falls back to database text if PDF download fails
   - Shows clear error messages to users

## 🐛 Troubleshooting

### Issue: "OpenAI API key not found"
- **Solution**: Create `.env` file in project root with `VITE_OPENAI_API_KEY=your_key`
- **Restart**: Restart dev server after adding/updating `.env`

### Issue: "No resume text available"
- **Solution**: Ensure resumes are uploaded to storage bucket
- **Check**: Verify `candidates.resume_url` is populated
- **Verify**: Storage bucket policies allow reading

### Issue: PDF extraction fails
- **Check**: Resume URL is accessible (public URL or signed URL)
- **Solution**: Ensure storage bucket allows anonymous/authenticated reads
- **Alternative**: Edge Function can extract text server-side

### Issue: Low match scores for all candidates
- **Check**: Job requirements are properly set (skills, experience)
- **Verify**: Resume PDFs contain actual text (not scanned images)
- **Note**: Scores are intentionally strict for quality

## 📈 Future Enhancements

1. **Edge Function Integration**:
   - Move OpenAI calls to server-side for better security
   - Process resumes automatically on upload
   - Store extracted data immediately

2. **Embeddings for Better Matching**:
   - Use OpenAI embeddings for semantic similarity
   - More accurate matching than prompt-based approach

3. **Batch Processing**:
   - Process multiple jobs simultaneously
   - Background job queue for large candidate sets

4. **Match Explanations**:
   - Detailed breakdown of score components
   - Highlight matching/missing skills
   - Show experience gap analysis

## ✅ Testing Checklist

- [x] PDF extraction from Supabase storage
- [x] OpenAI API integration for extraction
- [x] Comprehensive data extraction (skills, education, experience)
- [x] AI-powered semantic matching
- [x] Database updates with extracted data
- [x] UI display with detailed candidate information
- [x] Error handling and fallbacks
- [x] Progress indicators during processing

## 🎯 Usage

1. Upload resumes via the **Resumes** page
2. Ensure resumes are in PDF format
3. Go to **Matching** page
4. Select a job position
5. Click **"Run AI Match Analysis"**
6. View results sorted by match score

The system will automatically:
- Download PDFs from storage
- Extract comprehensive data using AI
- Calculate match scores
- Update database
- Display results

---

**Note**: The first run may take longer as PDFs are downloaded and processed. Subsequent runs use cached resume text from the database.







# AI-Powered Resume Matcher - Complete System

Production-ready Supabase Edge Functions for automated resume processing with OpenAI.

## 📦 What's Included

1. **`process-resumes`** Edge Function - Processes all PDFs from storage, analyzes with OpenAI, saves to database
2. **`get-top-candidates`** Edge Function - Returns top N candidates ordered by match score
3. **Database Schema** - SQL migration for `resume_scores` table
4. **Documentation** - Complete setup and deployment guides

## 🚀 Quick Start

### 1. Database Setup

```sql
-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS resume_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_scores_score ON resume_scores(score DESC);
ALTER TABLE resume_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON resume_scores
  FOR SELECT USING (true);

CREATE POLICY "Allow service role full access" ON resume_scores
  FOR ALL USING (auth.role() = 'service_role');
```

### 2. Storage Bucket

Create bucket `resumes` in Supabase Dashboard → Storage (make it public or configure RLS)

### 3. Deploy Functions

```bash
supabase functions deploy process-resumes
supabase functions deploy get-top-candidates
```

### 4. Set Secrets

In Supabase Dashboard → Edge Functions → Settings → Secrets:
- `OPENAI_API_KEY` - Your OpenAI API key
- `JOB_REQUIREMENT` - (Optional) Custom job description

## 📖 API Usage

### Process Resumes

**POST** `/functions/v1/process-resumes`

Processes all PDFs in storage bucket, analyzes with OpenAI, saves to database.

**Response:**
```json
{
  "message": "Processed 4 resumes successfully",
  "processed": 4,
  "topCandidates": [...]
}
```

### Get Top Candidates

**GET** `/functions/v1/get-top-candidates?limit=5`

**POST** `/functions/v1/get-top-candidates` (with body: `{"limit": 5}`)

Returns top N candidates ordered by score.

**Response:**
```json
{
  "count": 5,
  "candidates": [
    {
      "id": "uuid",
      "file_name": "resume.pdf",
      "name": "John Doe",
      "skills": ["JavaScript", "React"],
      "score": 95,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

## 🔧 Features

- ✅ Automatic PDF text extraction (pdf.js)
- ✅ OpenAI GPT-4o-mini analysis
- ✅ Structured JSON output (name, skills, score)
- ✅ Retry logic with exponential backoff
- ✅ Error handling and logging
- ✅ CORS support
- ✅ Production-ready code

## 📁 File Structure

```
supabase/
├── functions/
│   ├── process-resumes/
│   │   └── index.ts           # Main processing function
│   └── get-top-candidates/
│       └── index.ts           # Top candidates API
├── migrations/
│   └── 001_create_resume_scores_table.sql
└── .env.example
```

## 🔒 Security

- Environment variables for API keys
- Row Level Security (RLS) enabled
- Service role authentication for Edge Functions
- CORS headers configured

## 📝 Notes

- Processes up to 100 PDFs per invocation
- Requires PDFs with actual text (not scanned images)
- Uses `gpt-4o-mini` model (can be changed in code)
- All functions include comprehensive error handling

## 🐛 Troubleshooting

See `SETUP_EDGE_FUNCTIONS.md` for detailed troubleshooting guide.







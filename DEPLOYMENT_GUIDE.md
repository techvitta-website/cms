# Quick Deployment Guide

## 1. Create Database Table

Run this SQL in Supabase SQL Editor:

```sql
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
CREATE INDEX IF NOT EXISTS idx_resume_scores_file_name ON resume_scores(file_name);

ALTER TABLE resume_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON resume_scores
  FOR SELECT USING (true);

CREATE POLICY "Allow service role full access" ON resume_scores
  FOR ALL USING (auth.role() = 'service_role');
```

## 2. Create Storage Bucket

1. Go to Supabase Dashboard → Storage
2. Create bucket named: `resumes`
3. Make it **Public** (or configure RLS)
4. Upload your PDF files

## 3. Deploy Edge Functions

### Using Supabase CLI:

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy functions
supabase functions deploy process-resumes
supabase functions deploy get-top-candidates
```

### Using Supabase Dashboard:

1. Go to Edge Functions → Create Function
2. Create `process-resumes` - copy code from `supabase/functions/process-resumes/index.ts`
3. Create `get-top-candidates` - copy code from `supabase/functions/get-top-candidates/index.ts`

## 4. Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings → Secrets:

- `OPENAI_API_KEY`: Your OpenAI API key
- `JOB_REQUIREMENT`: (Optional) Custom job description

## 5. Test

Call the function:

```bash
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/process-resumes \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## 6. Get Results

```bash
curl -X GET \
  "https://YOUR_PROJECT.supabase.co/functions/v1/get-top-candidates?limit=5" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```







# AI-Powered Resume Matcher - Setup Guide

This system uses Supabase Edge Functions to automatically process PDF resumes from storage, analyze them with OpenAI, and store results in the database.

## 🏗️ Architecture

1. **Storage Bucket**: `resumes` - Stores PDF resume files
2. **Edge Function**: `process-resumes` - Processes PDFs and analyzes with AI
3. **Edge Function**: `get-top-candidates` - Returns top 5 candidates API
4. **Database Table**: `resume_scores` - Stores analysis results

## 📋 Prerequisites

1. Supabase project with storage enabled
2. OpenAI API key
3. Supabase CLI installed (`npm install -g supabase`)

## 🚀 Setup Steps

### Step 1: Create Storage Bucket

1. Go to Supabase Dashboard → Storage
2. Create a new bucket named `resumes`
3. Set bucket to **Public** (or configure RLS policies)
4. Upload PDF resume files

### Step 2: Create Database Table

Run the migration to create the `resume_scores` table:

```bash
# If using Supabase CLI
supabase db push

# Or run the SQL directly in Supabase SQL Editor
# Copy contents of: supabase/migrations/001_create_resume_scores_table.sql
```

### Step 3: Deploy Edge Functions

```bash
# Login to Supabase (if not already)
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy functions
supabase functions deploy process-resumes
supabase functions deploy get-top-candidates
```

### Step 4: Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings → Secrets:

1. **OPENAI_API_KEY**: Your OpenAI API key
   ```
   sk-proj-your-key-here
   ```

2. **JOB_REQUIREMENT** (optional): Custom job requirements
   ```
   We are looking for a senior full-stack developer with:
   - 5+ years experience with React and Node.js
   - Experience with PostgreSQL and Redis
   - Knowledge of Docker and Kubernetes
   - Strong problem-solving skills
   ```

### Step 5: Configure Storage Policies

If bucket is private, ensure Edge Functions can access it:

```sql
-- Allow service role to read from resumes bucket
CREATE POLICY "Service role can read resumes"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'resumes');

-- Allow service role to download files
CREATE POLICY "Service role can download resumes"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'resumes');
```

## 📖 Usage

### Process All Resumes

**Endpoint**: `POST https://your-project.supabase.co/functions/v1/process-resumes`

```bash
curl -X POST \
  https://your-project.supabase.co/functions/v1/process-resumes \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "message": "Processed 4 resumes successfully",
  "processed": 4,
  "topCandidates": [
    {
      "id": "uuid",
      "file_name": "resume.pdf",
      "name": "John Doe",
      "skills": ["JavaScript", "React", "Node.js"],
      "score": 95,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### Get Top Candidates

**Endpoint**: `GET https://your-project.supabase.co/functions/v1/get-top-candidates?limit=5`

```bash
curl -X GET \
  "https://your-project.supabase.co/functions/v1/get-top-candidates?limit=5" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Response**:
```json
{
  "count": 5,
  "candidates": [
    {
      "id": "uuid",
      "file_name": "resume.pdf",
      "name": "John Doe",
      "skills": ["JavaScript", "React", "Node.js"],
      "score": 95,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

## 🔧 Frontend Integration

### React Example

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Process all resumes
async function processResumes() {
  const { data, error } = await supabase.functions.invoke('process-resumes', {
    body: {},
  });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Results:', data);
}

// Get top candidates
async function getTopCandidates(limit = 5) {
  const { data, error } = await supabase.functions.invoke('get-top-candidates', {
    method: 'GET',
    headers: {
      'limit': limit.toString(),
    },
  });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  return data.candidates;
}
```

## 🔄 Automated Processing

### Option 1: Database Trigger (on file upload)

Create a trigger that calls the Edge Function when a file is uploaded:

```sql
-- Note: This requires pg_net extension
-- Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to trigger Edge Function
CREATE OR REPLACE FUNCTION trigger_process_resume()
RETURNS TRIGGER AS $$
BEGIN
  -- Call Edge Function asynchronously
  PERFORM net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/process-resumes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('file_name', NEW.name)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Storage triggers are complex, manual invocation is recommended
```

### Option 2: Scheduled Function (Supabase Cron)

Set up a cron job to process resumes daily:

```sql
-- Create function to process all resumes
-- (This would call your Edge Function via HTTP)

-- Schedule via Supabase Dashboard → Database → Cron Jobs
-- Or use pg_cron extension
```

### Option 3: Manual Trigger (Recommended)

Call the Edge Function manually when needed:
- Via frontend button
- Via Supabase Dashboard
- Via API call

## 🐛 Troubleshooting

### Error: "Missing Supabase environment variables"
- Edge Functions automatically have `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- If missing, check your Supabase project settings

### Error: "Failed to extract PDF text"
- Ensure PDFs contain actual text (not scanned images)
- Check PDF.js CDN is accessible
- Verify file is a valid PDF format

### Error: "OpenAI API error"
- Verify `OPENAI_API_KEY` is set correctly in Edge Function secrets
- Check API key has sufficient credits
- Verify API key has access to `gpt-4o-mini` model

### No results in `resume_scores` table
- Check Edge Function logs in Supabase Dashboard
- Verify bucket name is exactly `resumes`
- Ensure PDFs are uploaded to storage bucket
- Check RLS policies allow service role to insert

## 📊 Monitoring

View Edge Function logs:
1. Go to Supabase Dashboard → Edge Functions → Logs
2. Select function name (`process-resumes` or `get-top-candidates`)
3. View real-time logs and errors

## 🔒 Security Notes

1. **API Keys**: Never commit `.env` files or expose keys
2. **RLS Policies**: Adjust based on your security requirements
3. **Bucket Access**: Use private buckets with proper policies in production
4. **Service Role**: Keep service role key secure (only used by Edge Functions)

## 📝 File Structure

```
supabase/
├── functions/
│   ├── process-resumes/
│   │   └── index.ts        # Main processing function
│   └── get-top-candidates/
│       └── index.ts        # Top candidates API
├── migrations/
│   └── 001_create_resume_scores_table.sql
└── .env.example            # Environment variable template
```

## ✅ Testing

1. Upload a test PDF to `resumes` bucket
2. Call `process-resumes` Edge Function
3. Check `resume_scores` table for results
4. Call `get-top-candidates` to verify API works

---

**Note**: The system processes up to 100 PDFs per invocation. For larger batches, modify the limit in the function or call multiple times.







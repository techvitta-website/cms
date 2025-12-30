# 📋 Supabase CID Verification Setup Guide

## Complete Step-by-Step Setup

### ✅ Step 1: Run Database Migration (Already Created)

**File:** `supabase/migrations/007_add_document_verification_status.sql`

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **"New Query"**
3. Copy and paste the entire content from `007_add_document_verification_status.sql`
4. Click **"Run"** (or press Ctrl+Enter)
5. Verify: Should see "Success. No rows returned"

**What this does:**
- Adds `document_verification_status` column to `candidates` table
- Sets default value to `'not_requested'`
- Creates index for faster queries

---

### ✅ Step 2: Create Database Tables for Document System

**Go to:** Supabase Dashboard → **SQL Editor** → **New Query**

**Copy and paste this SQL:**

```sql
-- ============================================
-- Table 1: Document Upload Tokens
-- Stores unique tokens for candidate upload links
-- ============================================

CREATE TABLE IF NOT EXISTS document_upload_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed')),
  requested_by UUID REFERENCES hr_users(id),
  email_sent_at TIMESTAMPTZ,
  upload_deadline TIMESTAMPTZ
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_upload_tokens_token ON document_upload_tokens(token);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_candidate_id ON document_upload_tokens(candidate_id);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_status ON document_upload_tokens(status);

-- Enable RLS (Row Level Security)
ALTER TABLE document_upload_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all tokens
CREATE POLICY "Allow authenticated users to read upload tokens"
  ON document_upload_tokens FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert tokens
CREATE POLICY "Allow authenticated users to insert upload tokens"
  ON document_upload_tokens FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update tokens
CREATE POLICY "Allow authenticated users to update upload tokens"
  ON document_upload_tokens FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- Table 2: Candidate Documents
-- Stores metadata about uploaded documents
-- ============================================

CREATE TABLE IF NOT EXISTS candidate_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  upload_token_id UUID REFERENCES document_upload_tokens(id),
  document_type TEXT NOT NULL CHECK (document_type IN (
    'aadhar', 'pan', 'degree', 'experience', 
    'address_proof', 'bank_details', 'photo', 'other'
  )),
  document_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES hr_users(id),
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN (
    'pending', 'verified', 'rejected', 'revision_requested'
  )),
  verification_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_candidate_documents_candidate_id 
  ON candidate_documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_token_id 
  ON candidate_documents(upload_token_id);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_status 
  ON candidate_documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_type 
  ON candidate_documents(document_type);

-- Enable RLS
ALTER TABLE candidate_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all documents
CREATE POLICY "Allow authenticated users to read candidate documents"
  ON candidate_documents FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert documents
CREATE POLICY "Allow authenticated users to insert candidate documents"
  ON candidate_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update documents
CREATE POLICY "Allow authenticated users to update candidate documents"
  ON candidate_documents FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anonymous users to insert documents (for public upload page)
CREATE POLICY "Allow anonymous users to insert candidate documents"
  ON candidate_documents FOR INSERT
  TO anon
  WITH CHECK (true);

-- ============================================
-- Table 3: Document Requests
-- Tracks when document request emails were sent
-- ============================================

CREATE TABLE IF NOT EXISTS document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  upload_token_id UUID REFERENCES document_upload_tokens(id),
  requested_by UUID REFERENCES hr_users(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  email_subject TEXT,
  email_content TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'reminder_sent', 'completed'
  )),
  reminder_count INT DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_document_requests_candidate_id 
  ON document_requests(candidate_id);
CREATE INDEX IF NOT EXISTS idx_document_requests_status 
  ON document_requests(status);
CREATE INDEX IF NOT EXISTS idx_document_requests_token_id 
  ON document_requests(upload_token_id);

-- Enable RLS
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all requests
CREATE POLICY "Allow authenticated users to read document requests"
  ON document_requests FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert requests
CREATE POLICY "Allow authenticated users to insert document requests"
  ON document_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update requests
CREATE POLICY "Allow authenticated users to update document requests"
  ON document_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

**Click "Run"** and verify success.

---

### ✅ Step 3: Create Storage Bucket for Candidate Documents

1. Go to **Supabase Dashboard** → **Storage** → **Buckets**
2. Click **"+ New bucket"** button (top right)
3. Fill in the form:
   - **Name**: `candidate-documents` (exact lowercase, with hyphen)
   - **Public bucket**: ❌ **UNCHECK** (Keep it private)
   - **File size limit**: `10` MB (recommended)
   - **Allowed MIME types**: 
     ```
     application/pdf,image/jpeg,image/jpg,image/png
     ```
4. Click **"Create bucket"**

---

### ✅ Step 4: Set Storage Policies for candidate-documents Bucket

**Go to:** Supabase Dashboard → **SQL Editor** → **New Query**

**Copy and paste this SQL:**

```sql
-- ============================================
-- Storage Policies for candidate-documents Bucket
-- ============================================

-- Policy 1: Allow anonymous users to UPLOAD documents
-- (Candidates will upload without login)
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'candidate-documents' AND
  -- Only allow uploads to folders matching token pattern
  (storage.foldername(name))[1] ~ '^[a-zA-Z0-9_-]{20,}$'
);

-- Policy 2: Allow authenticated users to READ documents
-- (HR can view uploaded documents)
CREATE POLICY "Allow authenticated read candidate-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'candidate-documents');

-- Policy 3: Allow authenticated users to DELETE documents
-- (HR can delete if needed)
CREATE POLICY "Allow authenticated delete candidate-documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'candidate-documents');

-- Policy 4: Allow service role full access
-- (For Edge Functions if needed)
CREATE POLICY "Service role can read candidate-documents"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'candidate-documents');

CREATE POLICY "Service role can insert candidate-documents"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'candidate-documents');

CREATE POLICY "Service role can delete candidate-documents"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'candidate-documents');
```

**Click "Run"** and verify success.

---

### ✅ Step 5: Verify Everything is Set Up

#### Check Database Tables:
1. Go to **Table Editor**
2. You should see these new tables:
   - ✅ `document_upload_tokens`
   - ✅ `candidate_documents`
   - ✅ `document_requests`
3. Check `candidates` table - should have `document_verification_status` column

#### Check Storage Bucket:
1. Go to **Storage** → **Buckets**
2. You should see `candidate-documents` bucket
3. Click on it → **Settings** tab
4. Verify:
   - ✅ Public bucket: **OFF** (Private)
   - ✅ File size limit: 10 MB
   - ✅ Allowed MIME types: pdf, jpeg, jpg, png

#### Check Storage Policies:
1. Go to **Storage** → **Policies**
2. Scroll down to see policies for `candidate-documents`
3. Should see:
   - ✅ "Allow anon upload to candidate-documents"
   - ✅ "Allow authenticated read candidate-documents"
   - ✅ "Allow authenticated delete candidate-documents"
   - ✅ Service role policies

---

## 📝 Summary Checklist

- [ ] Migration `007_add_document_verification_status.sql` run successfully
- [ ] Table `document_upload_tokens` created
- [ ] Table `candidate_documents` created
- [ ] Table `document_requests` created
- [ ] Storage bucket `candidate-documents` created (Private)
- [ ] Storage policies for `candidate-documents` created
- [ ] All tables visible in Table Editor
- [ ] Bucket visible in Storage → Buckets
- [ ] Policies visible in Storage → Policies

---

## 🔍 Testing (After Frontend is Ready)

1. **Test Token Creation:**
   - Go to CID Verification page
   - Click "Send Document Request" on a candidate
   - Check `document_upload_tokens` table - should see new record

2. **Test Document Upload:**
   - Use the generated upload link
   - Upload a test document
   - Check `candidate-documents` table - should see new record
   - Check Storage → Buckets → `candidate-documents` - file should be there

3. **Test Document Viewing:**
   - Go to CID Verification page
   - Click "View Documents" on a candidate
   - Should be able to see/download the uploaded file

---

## ⚠️ Important Notes

1. **Token Pattern:** The storage policy checks that uploads go to folders matching token pattern. Tokens should be at least 20 characters (UUID + timestamp).

2. **File Size:** Maximum 10 MB per file. Adjust in bucket settings if needed.

3. **MIME Types:** Only PDF and images allowed. Add more types in bucket settings if needed.

4. **Security:** 
   - Anonymous users can ONLY upload (not read)
   - Authenticated users can read and delete
   - Service role has full access (for Edge Functions)

5. **RLS Policies:** All tables have Row Level Security enabled. Only authenticated users can access (except anon can insert documents).

---

## 🐛 Troubleshooting

### Error: "new row violates row-level security"
- **Fix:** Check RLS policies are created correctly
- Re-run the table creation SQL

### Error: "Bucket not found"
- **Fix:** Check bucket name is exactly `candidate-documents` (case-sensitive)

### Error: "Upload failed - policy violation"
- **Fix:** Check storage policies are created
- Verify token pattern matches (should be UUID format)

### Files not visible in Storage
- **Fix:** Check bucket exists and policies allow INSERT
- Verify file size is under 10 MB
- Check MIME type is allowed

---

## ✅ You're Done!

Once all steps are completed, your Supabase backend is ready for the CID Verification system!



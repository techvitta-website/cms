# Fix Document Upload Error - "new row violates row-level security policy"

## Problem
When candidates upload documents via the upload link, they get an error: **"new row violates row-level security policy"**

## Root Causes Fixed

1. **Storage Path Issue**: Code was using candidate name for folder, but storage policy required UUID pattern
2. **Missing RLS Policies**: Anonymous users couldn't read/update necessary tables
3. **Storage Policy Pattern**: Needed to match UUID format exactly

## Changes Made

### 1. Code Changes ✅
- **File**: `src/pages/UploadDocuments.tsx`
- **Change**: Updated storage path to use `candidate_id` (UUID) instead of candidate name
- **Line**: ~274
- **Before**: `${sanitizedCandidateName}/${docType}_...`
- **After**: `${candidateIdFolder}/${docType}_...` (where candidateIdFolder = candidate_id UUID)

### 2. Database Migrations Created

Run these migrations in Supabase Dashboard → SQL Editor (in order):

#### Migration 011: Fix Storage Policies
**File**: `supabase/migrations/011_fix_candidate_documents_storage_policies.sql`
- Updates storage policy to allow UUID folder pattern (candidate_id)
- Adds policy for anonymous users to read their uploaded documents
- Ensures proper access for document viewing

#### Migration 012: Allow Anonymous SELECT on candidate_documents
**File**: `supabase/migrations/012_add_anon_select_candidate_documents.sql`
- Allows anonymous users to read from `candidate_documents` table
- Needed so candidates can see their uploaded documents list

#### Migration 013: Allow Anonymous SELECT on candidates
**File**: `supabase/migrations/013_add_anon_select_candidates.sql`
- Allows anonymous users to read from `candidates` table
- Needed so candidates can see their information on the upload page

#### Migration 014: Allow Anonymous UPDATE on candidates
**File**: `supabase/migrations/014_add_anon_update_candidates_doc_status.sql`
- Allows anonymous users to update `document_verification_status` in `candidates` table
- Needed when first document is uploaded

## Steps to Fix

### Step 1: Run Migrations in Supabase

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Run each migration file in order:
   - `011_fix_candidate_documents_storage_policies.sql`
   - `012_add_anon_select_candidate_documents.sql`
   - `013_add_anon_select_candidates.sql`
   - `014_add_anon_update_candidates_doc_status.sql`

3. For each migration:
   - Click **"New Query"**
   - Copy and paste the entire content
   - Click **"Run"**
   - Verify success message

### Step 2: Verify Storage Bucket Exists

1. Go to **Supabase Dashboard** → **Storage** → **Buckets**
2. Verify bucket `candidate-documents` exists
3. If not, create it:
   - Name: `candidate-documents` (exact, lowercase, with hyphen)
   - Public: ❌ **OFF** (Private)
   - File size limit: `10` MB
   - Allowed MIME types: `application/pdf,image/jpeg,image/jpg,image/png`

### Step 3: Test Upload

1. Open a candidate upload link (e.g., `localhost:8080/{candidate-id}/upload-documents`)
2. Try uploading a document
3. Should work without errors now!

## How It Works Now

1. **Document Upload Flow**:
   - Candidate selects file → File uploaded to `candidate-documents/{candidate_id}/{docType}_{timestamp}_{filename}`
   - Document metadata saved to `candidate_documents` table
   - Storage path uses UUID (candidate_id) which matches storage policy pattern

2. **Document Storage**:
   - Files stored in: `candidate-documents/{candidate_id}/...`
   - File URL stored in database: `candidate-documents/{candidate_id}/...`
   - Documents can be retrieved and displayed on website

3. **Document Display**:
   - HR can view documents in Document Verification page
   - Documents retrieved from storage bucket using signed URLs
   - File URLs are properly formatted for retrieval

## Security Notes

- Anonymous users can only upload to folders matching their candidate_id (UUID)
- Anonymous users can only read their own candidate record (filtered by candidate_id in URL)
- Anonymous users can only update document_verification_status
- All documents are stored in private bucket, accessible only via signed URLs for HR

## Verification Checklist

- [ ] Migration 011 run successfully
- [ ] Migration 012 run successfully
- [ ] Migration 013 run successfully
- [ ] Migration 014 run successfully
- [ ] Storage bucket `candidate-documents` exists
- [ ] Test upload works without errors
- [ ] Documents appear in storage bucket
- [ ] Documents visible in Document Verification page

## If Issues Persist

1. **Check Storage Policies**: Go to Storage → Policies → Verify policies exist for `candidate-documents`
2. **Check RLS Policies**: Go to Table Editor → candidate_documents → Check RLS policies
3. **Check Console**: Open browser console (F12) to see detailed error messages
4. **Verify Bucket Name**: Ensure bucket name is exactly `candidate-documents` (lowercase, with hyphen)


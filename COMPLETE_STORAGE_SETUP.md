# 📦 Complete Storage Bucket Setup Guide

## Step 1: Create New Bucket

### In Supabase Dashboard:
1. Go to **Storage** → **Buckets**
2. Click **"+ New bucket"** button (top right)
3. Fill in:
   - **Name**: `resumes` (exact lowercase)
   - **Public bucket**: ✅ **ENABLE** (check the box)
   - **File size limit**: `50` MB (or leave default)
   - **Allowed MIME types**: Leave empty (or add: `application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
4. Click **"Create bucket"**

## Step 2: Set Storage Policies (SQL)

Go to **SQL Editor** and run these policies:

```sql
-- Policy 1: Allow anon users to INSERT files
CREATE POLICY "anon insert resumes"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'resumes'
);

-- Policy 2: Allow anon users to SELECT (view/download) files
CREATE POLICY "anon select resumes"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'resumes'
);

-- Policy 3: Allow authenticated users to INSERT files
CREATE POLICY "auth insert resumes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
);

-- Policy 4: Allow authenticated users to SELECT files
CREATE POLICY "auth select resumes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
);

-- Policy 5: Allow authenticated users to UPDATE files (optional)
CREATE POLICY "auth update resumes"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'resumes'
)
WITH CHECK (
  bucket_id = 'resumes'
);

-- Policy 6: Allow authenticated users to DELETE files (optional)
CREATE POLICY "auth delete resumes"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'resumes'
);
```

## Step 3: Verify Bucket is Public

1. Go to **Storage** → **Buckets** → Click **"resumes"** bucket
2. Click **Settings** tab
3. Verify **"Public bucket"** is enabled

## Step 4: Test Upload

1. Try uploading a resume in your app
2. Check **Storage** → **Buckets** → **resumes** → Files should appear
3. Check **Database** → **candidates** table → `resume_url` should have URL

## Troubleshooting:

If still getting errors:
1. **Restart Project**: Settings → General → Restart project
2. **Check Storage Service**: Storage section should load without errors
3. **Contact Support**: If Storage service itself doesn't work










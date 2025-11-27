# 📦 Experience Letter Storage Bucket Setup Guide

## Step 1: Create New Bucket

### In Supabase Dashboard:
1. Go to **Storage** → **Buckets**
2. Click **"+ New bucket"** button (top right)
3. Fill in:
   - **Name**: `experience-letters` (exact lowercase)
   - **Public bucket**: ✅ **ENABLE** (check the box)
   - **File size limit**: `50` MB (or leave default)
   - **Allowed MIME types**: Leave empty (or add: `application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
4. Click **"Create bucket"**

## Step 2: Set Storage Policies (SQL)

Go to **SQL Editor** in Supabase Dashboard and run these policies:

```sql
-- Policy 1: Allow anon users to INSERT files
CREATE POLICY "anon insert experience-letters"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'experience-letters'
);

-- Policy 2: Allow anon users to SELECT (view/download) files
CREATE POLICY "anon select experience-letters"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'experience-letters'
);

-- Policy 3: Allow authenticated users to INSERT files
CREATE POLICY "auth insert experience-letters"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'experience-letters'
);

-- Policy 4: Allow authenticated users to SELECT files
CREATE POLICY "auth select experience-letters"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'experience-letters'
);

-- Policy 5: Allow authenticated users to UPDATE files (optional)
CREATE POLICY "auth update experience-letters"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'experience-letters'
)
WITH CHECK (
  bucket_id = 'experience-letters'
);

-- Policy 6: Allow authenticated users to DELETE files (optional)
CREATE POLICY "auth delete experience-letters"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'experience-letters'
);
```

## Step 3: Verify Bucket is Public

1. Go to **Storage** → **Buckets** → Click **"experience-letters"** bucket
2. Click **Settings** tab
3. Verify **"Public bucket"** is enabled ✅

## Step 4: Test Upload

1. Go to Experience Letter page in your app
2. Click "Upload Experience Letter" for any candidate
3. Select a PDF file and upload
4. Check **Storage** → **Buckets** → **experience-letters** → Files should appear
5. Verify email is sent to candidate with attachment

## Notes

- The bucket name must be exactly `experience-letters` (lowercase, with hyphen)
- Files are stored in structure: `{candidate_id}/{timestamp}_{filename}`
- Public bucket allows direct URL access to files
- All policies allow both anonymous and authenticated access for flexibility



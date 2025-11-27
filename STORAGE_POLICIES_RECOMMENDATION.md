# Storage Bucket Policies - Recommendations

## Current Issue

Your bucket is named `resumes-private` but has **anonymous (anon) access enabled**, which is contradictory. A private bucket should not allow anonymous access.

## Current Policies Analysis

### ❌ Issues:
1. **Anonymous INSERT and SELECT** - Allows anyone to upload and download without authentication
2. **Bucket name vs. permissions mismatch** - Named "private" but allows public access
3. **Security risk** - Any anonymous user can access all resumes

## Recommended Policies

### Option 1: Truly Private Bucket (RECOMMENDED)

**For `resumes-private` bucket - Bucket Level Policies:**

```
✅ authenticated SELECT resumes-private objects
✅ authenticated INSERT resumes-private objects  
✅ authenticated UPDATE resumes-private objects
✅ authenticated DELETE resumes-private objects
❌ Remove: anon policies (no anonymous access)
```

**Benefits:**
- Truly private and secure
- Only authenticated users can access
- Protects candidate data

**Requirements:**
- Frontend must authenticate users before accessing resumes
- Or use Edge Functions (service role) for backend processing

### Option 2: Public Upload, Private Read (Alternative)

If you want anonymous uploads but private reads:

```
✅ anon INSERT resumes-private objects (for uploading)
❌ Remove: anon SELECT (no anonymous downloads)
✅ authenticated SELECT resumes-private objects
✅ authenticated INSERT resumes-private objects
✅ authenticated UPDATE resumes-private objects
✅ authenticated DELETE resumes-private objects
```

## SQL to Create/Update Policies

### For Private Bucket (Recommended):

```sql
-- Remove anonymous policies
DROP POLICY IF EXISTS "anon insert resumes-private objects" ON storage.objects;
DROP POLICY IF EXISTS "anon select resumes-private objects" ON storage.objects;

-- Ensure authenticated user policies exist
CREATE POLICY "Authenticated users can read resumes"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resumes-private');

CREATE POLICY "Authenticated users can upload resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes-private');

CREATE POLICY "Authenticated users can update resumes"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'resumes-private')
WITH CHECK (bucket_id = 'resumes-private');

CREATE POLICY "Authenticated users can delete resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'resumes-private');
```

### For Service Role (Edge Functions) - REQUIRED:

```sql
-- Allow service role full access (for Edge Functions)
CREATE POLICY "Service role can read resumes"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'resumes-private');

CREATE POLICY "Service role can upload resumes"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'resumes-private');

CREATE POLICY "Service role can update resumes"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'resumes-private')
WITH CHECK (bucket_id = 'resumes-private');

CREATE POLICY "Service role can delete resumes"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'resumes-private');
```

## For Your Current Frontend Issue

Since your frontend uses the Supabase client (which defaults to anon key), you have two options:

### Solution A: Keep Anon SELECT (Temporary - Less Secure)
Keep the current `anon select` policy but understand this makes the bucket NOT truly private.

### Solution B: Use Authenticated Sessions (Recommended)
- Ensure users are authenticated when accessing resumes
- Remove anon policies
- Frontend will use authenticated user session

### Solution C: Use Edge Functions (Best for Production)
- Frontend calls Edge Functions (which use service role)
- Edge Functions have full access via service role policies
- Bucket remains truly private
- No direct client access needed

## Recommended Setup

Based on your Edge Functions implementation:

```sql
-- 1. Remove anonymous access
DROP POLICY IF EXISTS "anon insert resumes-private objects" ON storage.objects;
DROP POLICY IF EXISTS "anon select resumes-private objects" ON storage.objects;

-- 2. Keep authenticated user policies (for authenticated frontend access)
-- (Your existing auth policies are fine)

-- 3. Add service role policies (CRITICAL for Edge Functions)
CREATE POLICY IF NOT EXISTS "Service role full access resumes"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'resumes-private')
WITH CHECK (bucket_id = 'resumes-private');

-- 4. Optionally: Allow authenticated users
CREATE POLICY IF NOT EXISTS "Authenticated users can read resumes"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resumes-private');

CREATE POLICY IF NOT EXISTS "Authenticated users can upload resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes-private');
```

## Verification

After updating policies, test:
1. ✅ Edge Functions can read PDFs (service role)
2. ✅ Authenticated users can upload (if needed)
3. ❌ Anonymous users cannot access (if private bucket)

## Summary

**Your Current Setup:**
- ❌ Allows anonymous access (not truly private)
- ⚠️ Security risk

**Recommended:**
- ✅ Remove anonymous policies
- ✅ Keep authenticated policies
- ✅ Add service role policies (for Edge Functions)
- ✅ Bucket becomes truly private

Choose based on your security requirements!







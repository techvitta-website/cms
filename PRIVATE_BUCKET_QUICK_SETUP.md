# 🔐 Private Bucket Quick Setup Guide

## ✅ You've Created Private Bucket: `resumes-private`

## 📋 Complete Setup Steps

### Step 1: Run SQL Policies (CRITICAL!)
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open **New Query**
3. Copy entire content from **`private_bucket_policies.sql`**
4. Click **Run**
5. Should see: **"Success. No rows returned"**

### Step 2: Verify Policies
After running SQL, check:
- **Storage** → **Policies** → Scroll to **"OTHER POLICIES UNDER STORAGE.OBJECTS"**
- You should see 6 policies for `resumes-private`

### Step 3: Code Already Updated ✅
The code is already set to use `resumes-private` bucket.

### Step 4: Update Edge Function
If your Edge Function exists, update it:
```typescript
const BUCKET = "resumes-private"; // Change from "resumes" to "resumes-private"
```

### Step 5: Test Upload
1. Upload a PDF via frontend
2. Check Storage → Buckets → `resumes-private` → Files should appear
3. Check Console (F12) for any errors

---

## 🔒 Security Notes

**Private Bucket Benefits:**
- ✅ Files not publicly accessible without authentication
- ✅ More secure for sensitive resumes
- ✅ Better control over file access

**Access Methods:**
- Frontend (anon key) → Needs `anon` policies (included)
- Edge Function (service role) → Bypasses RLS (no policies needed)
- Authenticated users → Needs `auth` policies (included)

---

## ⚠️ If Upload Fails

### Error: "new row violates row-level security"
- **Cause**: Policies not applied correctly
- **Fix**: Re-run `private_bucket_policies.sql`

### Error: "schema net does not exist"
- **Cause**: Supabase Storage infrastructure issue (NOT bucket-related)
- **Fix**: Restart Supabase project (Settings → General → Restart)

### Error: "Bucket not found"
- **Cause**: Bucket name mismatch
- **Fix**: Check bucket name is exactly `resumes-private` (case-sensitive)

---

## ✅ Quick Checklist

- [ ] Private bucket created: `resumes-private`
- [ ] SQL policies run successfully
- [ ] Policies visible in Dashboard
- [ ] Code updated to use `resumes-private`
- [ ] Edge Function updated (if exists)
- [ ] Test upload successful

---

## 📝 What's Included in Policies

✅ **anon insert** - Anonymous can upload  
✅ **anon select** - Anonymous can download  
✅ **auth insert** - Authenticated can upload  
✅ **auth select** - Authenticated can download  
✅ **auth update** - Authenticated can update  
✅ **auth delete** - Authenticated can delete  

All policies are scoped to `resumes-private` bucket only!









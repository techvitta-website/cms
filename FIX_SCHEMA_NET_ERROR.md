# 🔴 CRITICAL: "schema 'net' does not exist" Error Fix

## This is a Supabase Infrastructure Error

The error `schema 'net' does not exist` means your Supabase Storage service has a configuration issue. This **cannot** be fixed by code changes.

## ✅ Step-by-Step Fix (Try in Order):

### Step 1: Restart Supabase Project
1. Go to **Supabase Dashboard** → Your Project
2. Click **Settings** (gear icon) → **General**
3. Scroll down to **"Danger Zone"**
4. Click **"Restart Project"** or **"Pause/Resume"**
5. Wait 2-3 minutes for project to restart
6. Try uploading again

### Step 2: Check Storage Extension
1. **Database** → **Extensions**
2. Search for **"storage"** extension
3. If it shows **"Installed"** ✅ → Good
4. If it's **missing** or shows error:
   - Click **"Install"** or **"Enable"**
   - If error appears → Go to Step 3

### Step 3: Re-create Storage Extension (SQL Editor)
Run this in **SQL Editor**:

```sql
-- Drop and recreate storage extension
DROP EXTENSION IF EXISTS storage CASCADE;
CREATE EXTENSION IF NOT EXISTS storage;

-- Verify it exists
SELECT * FROM pg_extension WHERE extname = 'storage';
```

### Step 4: Verify Storage Service Status
1. **Storage** → **Buckets**
2. If you see errors loading this page → Storage service is down
3. Go to **Step 5**

### Step 5: Contact Supabase Support
If Steps 1-4 don't work:
1. **Supabase Dashboard** → **Help** → **Support**
2. Include this error message:
   ```
   Error: schema "net" does not exist
   When: Uploading file to storage bucket
   Project: qzgzmytmfoozociuhgtp
   ```
3. Ask them to check Storage service configuration

## ⚠️ Temporary Workaround

Until Storage is fixed, the app will:
- ✅ Save candidate data to database
- ❌ Skip file storage (resume_url will be null)
- Continue working normally

Files will be stored locally but not in Supabase bucket.










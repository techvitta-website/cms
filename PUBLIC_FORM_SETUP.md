# Public Candidate Form - Database Setup Guide

## Overview
This guide helps you set up the database to save form submissions from the public candidate form (`/apply` or `/candidate-form`) directly to your CMS dashboard.

## Step 1: Run the SQL Migration

1. Open **Supabase Dashboard** → **SQL Editor**
2. Open the file: `supabase/migrations/018_ensure_public_form_save.sql`
3. Copy the entire SQL content
4. Paste it into the SQL Editor
5. Click **RUN**

This migration will:
- ✅ Allow anonymous users to INSERT into `candidates` table
- ✅ Allow anonymous users to UPDATE `candidates` table (for duplicate emails)
- ✅ Allow anonymous users to INSERT into `resume_upload_hashes` table
- ✅ Allow anonymous users to upload resumes to storage buckets
- ✅ Ensure all required columns exist

## Step 2: Verify the Setup

After running the migration, verify:

### Check RLS Policies:
```sql
SELECT 
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE tablename IN ('candidates', 'resume_upload_hashes')
    AND roles::text LIKE '%anon%'
ORDER BY tablename, policyname;
```

You should see:
- `Allow anonymous users to insert candidates` (INSERT)
- `Allow anonymous users to update candidates` (UPDATE)
- `Allow anonymous users to insert resume hashes` (INSERT)

### Check Storage Policies:
```sql
SELECT 
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE schemaname = 'storage' 
    AND tablename = 'objects'
    AND roles::text LIKE '%anon%'
    AND (policyname LIKE '%resumes%' OR policyname LIKE '%resume%');
```

## Step 3: Test the Form

1. Visit: `https://your-domain.com/apply` or `https://your-domain.com/candidate-form`
2. Fill out the form:
   - Full Name *
   - Email *
   - Phone Number *
   - Resume (PDF) *
3. Click "Submit Application"
4. Check your CMS Dashboard - the candidate should appear with:
   - Status: "Pending"
   - Reference Source: "Public Form"
   - All form fields populated

## Form Fields Saved to Database

| Form Field | Database Column | Required |
|------------|----------------|----------|
| Full Name | `full_name` | ✅ Yes |
| Email | `email` | ✅ Yes |
| Phone Number | `phone` | ✅ Yes |
| Resume File | `resume_url`, `resume_hash` | ✅ Yes |
| Reference Source | `reference_source` | Auto-set to "Public Form" |
| Status | `status` | Auto-set to "Pending" |

## Troubleshooting

### Issue: "Permission denied" error
**Solution**: Make sure you ran the SQL migration. Check RLS policies exist.

### Issue: Resume upload fails
**Solution**: 
1. Check storage bucket exists (`resumes-private` or `resumes`)
2. Verify storage policies allow anonymous INSERT
3. Check bucket is configured correctly in Supabase Storage

### Issue: Duplicate email error
**Solution**: The form automatically updates existing candidates with the same email. This is handled by the UPDATE policy.

### Issue: Candidate not appearing in dashboard
**Solution**:
1. Check `status` is set to "Pending" (not filtered out)
2. Check `is_archived` is false
3. Refresh the dashboard page
4. Check browser console for errors

## Security Notes

- ✅ Anonymous users can only INSERT and UPDATE (not DELETE)
- ✅ Resume files are stored securely in private buckets
- ✅ Email validation prevents invalid submissions
- ✅ Resume hash prevents duplicate uploads
- ✅ All submissions are tracked with `reference_source = "Public Form"`

## Next Steps

After setup:
1. Share the form link on social media: `/apply` or `/candidate-form`
2. Monitor submissions in your CMS Dashboard
3. Process resumes using the ATS processor (automatic)
4. Review candidates and update their status

## Support

If you encounter issues:
1. Check Supabase logs for errors
2. Verify all migrations are applied
3. Check RLS policies are active
4. Ensure storage buckets are configured




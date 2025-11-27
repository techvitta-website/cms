# Guide to Clean Duplicate Candidates

This guide will help you remove duplicate candidate records from your Supabase database.

## Files Created

1. **`clean_duplicates.sql`** - Direct deletion script (use with caution)
2. **`clean_duplicates_safe.sql`** - Safe version that shows previews before deletion (RECOMMENDED)

## Recommended Approach: Use the Safe Version

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Preview Duplicates

Copy and run **PART 1** and **PART 2** from `clean_duplicates_safe.sql` to see:
- Which candidates are duplicates
- Which ones will be kept (most recent)
- Which ones will be deleted

### Step 3: Review the Count

Run **PART 3** to see how many duplicates will be deleted.

### Step 4: Execute Deletion (After Review)

1. Review the preview results carefully
2. If everything looks correct, uncomment the deletion sections in **PART 4**
3. Run each deletion section one at a time:
   - First: Delete duplicates by `resume_hash`
   - Second: Delete duplicates by `email + full_name`
   - Third: Clean up orphaned records

### Step 5: Verify Results

Run **PART 5** to verify that duplicates have been removed.

## How Duplicates are Identified

1. **Primary Method: `resume_hash`**
   - Most reliable - identifies exact duplicate resume files
   - Keeps the candidate with the most recent `created_at` timestamp

2. **Secondary Method: `email + full_name`**
   - Used when `resume_hash` is not available
   - Filters out auto-generated emails (`@resume.imported`, `@email.com`)
   - Keeps the candidate with the most recent `created_at` timestamp

## What Gets Kept

For each group of duplicates, the script keeps:
- The candidate with the **most recent `created_at`** timestamp
- If timestamps are the same, keeps the one with the **highest `id`** (most recently created)

## What Gets Deleted

- All duplicate candidates (older records)
- Orphaned `matches` records (matches pointing to deleted candidates)
- Orphaned `shortlist_records` records
- Orphaned `interviews` records

## Important Notes

⚠️ **BACKUP FIRST**: Before running deletion scripts, consider:
- Exporting your data
- Testing on a development/staging environment first
- Running the preview queries multiple times to verify

⚠️ **Irreversible**: Once deleted, records cannot be recovered unless you have a backup.

## After Cleaning

After running the cleanup:
1. Refresh your Dashboard
2. Verify that duplicates are gone
3. Check that all candidates still have their correct data
4. The UI deduplication will still work as a safety measure

## Troubleshooting

If you encounter errors:
1. Check that you have the necessary permissions
2. Ensure foreign key constraints allow deletion
3. Check if there are any triggers that might prevent deletion
4. Review the error message and adjust the query if needed

## Quick Clean (Advanced Users Only)

If you're confident and want to run everything at once, use `clean_duplicates.sql`. This script:
- Deletes duplicates immediately
- Cleans up orphaned records
- Shows a summary at the end

**Use this only if you've reviewed the safe version and understand what will be deleted.**



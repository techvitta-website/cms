-- SQL Script to Clean Duplicate Candidates
-- Run this in Supabase SQL Editor

-- Step 1: Identify duplicates by resume_hash (most reliable method)
-- This will show you duplicates before deleting
SELECT 
    resume_hash,
    COUNT(*) as duplicate_count,
    STRING_AGG(id::text, ', ') as candidate_ids,
    STRING_AGG(full_name, ' | ') as names,
    STRING_AGG(email, ' | ') as emails
FROM candidates
WHERE resume_hash IS NOT NULL
GROUP BY resume_hash
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 2: Delete duplicates by resume_hash (keeps the most recent one)
-- This keeps the candidate with the latest created_at timestamp
WITH duplicates AS (
    SELECT 
        id,
        resume_hash,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY resume_hash 
            ORDER BY created_at DESC, id DESC
        ) as rn
    FROM candidates
    WHERE resume_hash IS NOT NULL
)
DELETE FROM candidates
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- Step 3: Identify duplicates by email + full_name (for cases without resume_hash)
-- This will show you duplicates before deleting
SELECT 
    LOWER(TRIM(email)) as normalized_email,
    TRIM(full_name) as name,
    COUNT(*) as duplicate_count,
    STRING_AGG(id::text, ', ') as candidate_ids
FROM candidates
WHERE email IS NOT NULL 
  AND email NOT LIKE '%@resume.imported'
  AND email NOT LIKE '%@email.com'
  AND full_name IS NOT NULL
GROUP BY LOWER(TRIM(email)), TRIM(full_name)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 4: Delete duplicates by email + full_name (keeps the most recent one)
WITH duplicates AS (
    SELECT 
        id,
        LOWER(TRIM(email)) as normalized_email,
        TRIM(full_name) as name,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(email)), TRIM(full_name)
            ORDER BY created_at DESC, id DESC
        ) as rn
    FROM candidates
    WHERE email IS NOT NULL 
      AND email NOT LIKE '%@resume.imported'
      AND email NOT LIKE '%@email.com'
      AND full_name IS NOT NULL
)
DELETE FROM candidates
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- Step 5: Clean up orphaned matches (matches pointing to deleted candidates)
-- This is optional but recommended to keep data clean
DELETE FROM matches
WHERE candidate_id NOT IN (SELECT id FROM candidates);

-- Step 6: Clean up orphaned shortlist_records
DELETE FROM shortlist_records
WHERE candidate_id NOT IN (SELECT id FROM candidates);

-- Step 7: Clean up orphaned interviews
DELETE FROM interviews
WHERE candidate_id NOT IN (SELECT id FROM candidates);

-- Step 8: Show summary of remaining candidates
SELECT 
    COUNT(*) as total_candidates,
    COUNT(DISTINCT resume_hash) as unique_resumes,
    COUNT(DISTINCT email) as unique_emails
FROM candidates;



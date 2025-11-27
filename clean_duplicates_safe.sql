-- SAFE VERSION: Shows what will be deleted before actually deleting
-- Run each section separately and review the results

-- ============================================
-- PART 1: Preview duplicates by resume_hash
-- ============================================
-- This shows you which candidates will be deleted (keeps the most recent)
WITH ranked_candidates AS (
    SELECT 
        id,
        resume_hash,
        full_name,
        email,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY resume_hash ORDER BY created_at DESC, id DESC) as rn,
        COUNT(*) OVER (PARTITION BY resume_hash) as duplicate_count
    FROM candidates
    WHERE resume_hash IS NOT NULL
)
SELECT 
    resume_hash,
    duplicate_count,
    id,
    full_name,
    email,
    created_at,
    CASE 
        WHEN rn = 1 THEN 'KEEP' 
        ELSE 'DELETE' 
    END as action
FROM ranked_candidates
WHERE duplicate_count > 1
ORDER BY resume_hash, created_at DESC;

-- ============================================
-- PART 2: Preview duplicates by email + name
-- ============================================
-- This shows duplicates where resume_hash is not available
WITH ranked_candidates AS (
    SELECT 
        id,
        LOWER(TRIM(email)) as normalized_email,
        TRIM(full_name) as name,
        email,
        full_name,
        created_at,
        resume_hash,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(email)), TRIM(full_name) 
            ORDER BY created_at DESC, id DESC
        ) as rn,
        COUNT(*) OVER (PARTITION BY LOWER(TRIM(email)), TRIM(full_name)) as duplicate_count
    FROM candidates
    WHERE email IS NOT NULL 
      AND email NOT LIKE '%@resume.imported'
      AND email NOT LIKE '%@email.com'
      AND full_name IS NOT NULL
)
SELECT 
    normalized_email,
    name,
    duplicate_count,
    id,
    email,
    full_name,
    created_at,
    resume_hash,
    CASE 
        WHEN rn = 1 THEN 'KEEP' 
        ELSE 'DELETE' 
    END as action
FROM ranked_candidates
WHERE duplicate_count > 1
ORDER BY normalized_email, name, created_at DESC;

-- ============================================
-- PART 3: Count duplicates before deletion
-- ============================================
SELECT 
    'By resume_hash' as method,
    COUNT(*) as duplicates_to_delete
FROM (
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY resume_hash 
            ORDER BY created_at DESC, id DESC
        ) as rn
    FROM candidates
    WHERE resume_hash IS NOT NULL
) sub
WHERE rn > 1

UNION ALL

SELECT 
    'By email + name' as method,
    COUNT(*) as duplicates_to_delete
FROM (
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(email)), TRIM(full_name)
            ORDER BY created_at DESC, id DESC
        ) as rn
    FROM candidates
    WHERE email IS NOT NULL 
      AND email NOT LIKE '%@resume.imported'
      AND email NOT LIKE '%@email.com'
      AND full_name IS NOT NULL
) sub
WHERE rn > 1;

-- ============================================
-- PART 4: ACTUAL DELETION (Run only after reviewing above)
-- ============================================
-- Uncomment the sections below after reviewing the previews above

-- Delete duplicates by resume_hash
/*
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
*/

-- Delete duplicates by email + full_name
/*
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
*/

-- Delete duplicates by resume_url (same file uploaded multiple times)
/*
WITH duplicates AS (
    SELECT 
        id,
        resume_url,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY resume_url 
            ORDER BY created_at DESC, id DESC
        ) as rn
    FROM candidates
    WHERE resume_url IS NOT NULL
)
DELETE FROM candidates
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);
*/

-- Delete duplicates by name (same name - be careful with this one!)
-- Only use this if you're sure the same person was added multiple times
/*
WITH duplicates AS (
    SELECT 
        id,
        TRIM(full_name) as name,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY TRIM(full_name)
            ORDER BY created_at DESC, id DESC
        ) as rn
    FROM candidates
    WHERE full_name IS NOT NULL
)
DELETE FROM candidates
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);
*/

-- Clean up orphaned records
/*
DELETE FROM matches
WHERE candidate_id NOT IN (SELECT id FROM candidates);

DELETE FROM shortlist_records
WHERE candidate_id NOT IN (SELECT id FROM candidates);

DELETE FROM interviews
WHERE candidate_id NOT IN (SELECT id FROM candidates);
*/

-- ============================================
-- PART 5: Check for duplicates by resume_url
-- ============================================
-- This finds duplicates where the same resume file was uploaded multiple times
WITH ranked_candidates AS (
    SELECT 
        id,
        resume_url,
        full_name,
        email,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY resume_url ORDER BY created_at DESC, id DESC) as rn,
        COUNT(*) OVER (PARTITION BY resume_url) as duplicate_count
    FROM candidates
    WHERE resume_url IS NOT NULL
)
SELECT 
    resume_url,
    duplicate_count,
    id,
    full_name,
    email,
    created_at,
    CASE 
        WHEN rn = 1 THEN 'KEEP' 
        ELSE 'DELETE' 
    END as action
FROM ranked_candidates
WHERE duplicate_count > 1
ORDER BY resume_url, created_at DESC;

-- ============================================
-- PART 6: Check for duplicates by name (same name appearing multiple times)
-- ============================================
-- This finds candidates with the same name (might be legitimate duplicates or different people)
WITH ranked_candidates AS (
    SELECT 
        id,
        full_name,
        email,
        phone,
        resume_url,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY TRIM(full_name) ORDER BY created_at DESC, id DESC) as rn,
        COUNT(*) OVER (PARTITION BY TRIM(full_name)) as duplicate_count
    FROM candidates
    WHERE full_name IS NOT NULL
)
SELECT 
    full_name,
    duplicate_count,
    id,
    email,
    phone,
    resume_url,
    created_at,
    CASE 
        WHEN rn = 1 THEN 'KEEP' 
        ELSE 'DELETE' 
    END as action
FROM ranked_candidates
WHERE duplicate_count > 1
ORDER BY full_name, created_at DESC;

-- ============================================
-- PART 7: Verify results after deletion
-- ============================================
SELECT 
    COUNT(*) as total_candidates,
    COUNT(DISTINCT resume_hash) as unique_resumes_by_hash,
    COUNT(DISTINCT resume_url) as unique_resumes_by_url,
    COUNT(DISTINCT email) as unique_emails,
    COUNT(DISTINCT full_name) as unique_names,
    COUNT(*) - COUNT(DISTINCT resume_url) as potential_duplicates_by_url,
    COUNT(*) - COUNT(DISTINCT email) as potential_duplicates_by_email
FROM candidates;


-- ============================================
-- CID Verification System - Database Tables
-- Migration: 008_create_cid_document_tables.sql
-- ============================================

-- Table 1: Document Upload Tokens
-- Stores unique tokens for candidate upload links
CREATE TABLE IF NOT EXISTS document_upload_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed')),
  requested_by UUID REFERENCES hr_users(id),
  email_sent_at TIMESTAMPTZ,
  upload_deadline TIMESTAMPTZ
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_upload_tokens_token ON document_upload_tokens(token);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_candidate_id ON document_upload_tokens(candidate_id);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_status ON document_upload_tokens(status);

-- Enable RLS (Row Level Security)
ALTER TABLE document_upload_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all tokens
CREATE POLICY "Allow authenticated users to read upload tokens"
  ON document_upload_tokens FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert tokens
CREATE POLICY "Allow authenticated users to insert upload tokens"
  ON document_upload_tokens FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update tokens
CREATE POLICY "Allow authenticated users to update upload tokens"
  ON document_upload_tokens FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- Table 2: Candidate Documents
-- Stores metadata about uploaded documents
-- ============================================

CREATE TABLE IF NOT EXISTS candidate_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  upload_token_id UUID REFERENCES document_upload_tokens(id),
  document_type TEXT NOT NULL CHECK (document_type IN (
    'aadhar', 'pan', 'degree', 'experience', 
    'address_proof', 'bank_details', 'photo', 'other'
  )),
  document_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES hr_users(id),
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN (
    'pending', 'verified', 'rejected', 'revision_requested'
  )),
  verification_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_candidate_documents_candidate_id 
  ON candidate_documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_token_id 
  ON candidate_documents(upload_token_id);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_status 
  ON candidate_documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_type 
  ON candidate_documents(document_type);

-- Enable RLS
ALTER TABLE candidate_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all documents
CREATE POLICY "Allow authenticated users to read candidate documents"
  ON candidate_documents FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert documents
CREATE POLICY "Allow authenticated users to insert candidate documents"
  ON candidate_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update documents
CREATE POLICY "Allow authenticated users to update candidate documents"
  ON candidate_documents FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anonymous users to insert documents (for public upload page)
CREATE POLICY "Allow anonymous users to insert candidate documents"
  ON candidate_documents FOR INSERT
  TO anon
  WITH CHECK (true);

-- ============================================
-- Table 3: Document Requests
-- Tracks when document request emails were sent
-- ============================================

CREATE TABLE IF NOT EXISTS document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  upload_token_id UUID REFERENCES document_upload_tokens(id),
  requested_by UUID REFERENCES hr_users(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  email_subject TEXT,
  email_content TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'reminder_sent', 'completed'
  )),
  reminder_count INT DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_document_requests_candidate_id 
  ON document_requests(candidate_id);
CREATE INDEX IF NOT EXISTS idx_document_requests_status 
  ON document_requests(status);
CREATE INDEX IF NOT EXISTS idx_document_requests_token_id 
  ON document_requests(upload_token_id);

-- Enable RLS
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all requests
CREATE POLICY "Allow authenticated users to read document requests"
  ON document_requests FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert requests
CREATE POLICY "Allow authenticated users to insert document requests"
  ON document_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update requests
CREATE POLICY "Allow authenticated users to update document requests"
  ON document_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);



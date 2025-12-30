-- Create email_replies table to store candidate email replies
CREATE TABLE IF NOT EXISTS email_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  candidate_email TEXT NOT NULL,
  candidate_name TEXT,
  subject TEXT,
  reply_content TEXT NOT NULL,
  original_email_id TEXT, -- Resend email ID that was replied to
  reply_email_id TEXT, -- Resend email ID of the reply
  email_stage TEXT, -- 'shortlist', 'interview', 'feedback', 'offer-letter', 'experience-letter'
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'unread', -- 'unread', 'read', 'archived'
  metadata JSONB -- Store additional metadata like attachments, etc.
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_email_replies_candidate_id ON email_replies(candidate_id);
CREATE INDEX IF NOT EXISTS idx_email_replies_candidate_email ON email_replies(candidate_email);
CREATE INDEX IF NOT EXISTS idx_email_replies_received_at ON email_replies(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_replies_email_stage ON email_replies(email_stage);
CREATE INDEX IF NOT EXISTS idx_email_replies_status ON email_replies(status);

-- Enable RLS
ALTER TABLE email_replies ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all email replies
CREATE POLICY "Allow authenticated users to read email replies"
  ON email_replies FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow service role to insert email replies (for webhook)
CREATE POLICY "Allow service role to insert email replies"
  ON email_replies FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Allow authenticated users to update email replies (mark as read, etc.)
CREATE POLICY "Allow authenticated users to update email replies"
  ON email_replies FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);













ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS processing_prompt TEXT;

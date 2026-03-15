-- Defence-in-depth: ensure episode_url is always an HTTPS URL.
-- The frontend validates this before insert, but this constraint prevents
-- any bypass via direct API calls (SSRF via internal/http URLs).
ALTER TABLE jobs
  ADD CONSTRAINT episode_url_https CHECK (episode_url LIKE 'https://%');

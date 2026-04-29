CREATE TABLE directors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('ceo','director','auditor')),
  as_of_date  DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_directors_company ON directors(company_id);

ALTER TABLE directors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read directors"
  ON directors FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admins can write directors"
  ON directors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' = 'admin'
    )
  );

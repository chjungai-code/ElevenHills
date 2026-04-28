CREATE TABLE shareholders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  percentage  NUMERIC(5,2) NOT NULL,
  is_entity   BOOLEAN DEFAULT FALSE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shareholders_company ON shareholders(company_id);

ALTER TABLE shareholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read shareholders"
  ON shareholders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admins can write shareholders"
  ON shareholders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' = 'admin'
    )
  );

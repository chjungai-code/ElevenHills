CREATE TABLE companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  short_name  TEXT,
  category    TEXT NOT NULL CHECK (category IN ('holding','subsidiary','standalone','sub_entity')),
  parent_id   UUID REFERENCES companies(id),
  locations   TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read companies"
  ON companies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admins can write companies"
  ON companies FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE TABLE revenue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year        INT NOT NULL,
  month       INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount      BIGINT NOT NULL DEFAULT 0,
  category    TEXT,
  memo        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, year, month, category)
);

CREATE INDEX idx_revenue_company_year ON revenue(company_id, year, month);

ALTER TABLE revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read revenue"
  ON revenue FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admins can write revenue"
  ON revenue FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' = 'admin'
    )
  );

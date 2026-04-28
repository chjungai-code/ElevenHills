CREATE TABLE kakao_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('daily','manual')),
  recipient   TEXT NOT NULL,
  content     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('sent','failed')),
  sent_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE kakao_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read kakao_logs"
  ON kakao_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service role can write kakao_logs"
  ON kakao_logs FOR INSERT
  TO service_role
  USING (true);

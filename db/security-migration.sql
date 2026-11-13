-- 頻度制限の期限切れ行を効率よく削除。既存データは保持。
CREATE INDEX IF NOT EXISTS auth_attempts_expires_idx ON auth_attempts(expires_at);

-- 既存の質問・回答を残す追加マイグレーション。メールアドレスは登録に使わない。
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_id VARCHAR(32);
CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_idx ON users(login_id);
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_attempts (
  key_hash VARCHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 将来のログイン追加時に、投稿とユーザーを関連付けられる設計。
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  display_name VARCHAR(50) NOT NULL,
  email VARCHAR(254) UNIQUE,
  login_id VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(150) NOT NULL CHECK (length(trim(title)) > 0),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  author_name VARCHAR(50) NOT NULL CHECK (length(trim(author_name)) > 0),
  category VARCHAR(20) NOT NULL CHECK (category IN ('授業', '課外活動', 'その他')),
  status VARCHAR(10) NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS answers (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  author_name VARCHAR(50) NOT NULL CHECK (length(trim(author_name)) > 0),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS questions_created_idx ON questions(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS answers_question_idx ON answers(question_id);
CREATE UNIQUE INDEX IF NOT EXISTS answers_question_id_id_idx ON answers(question_id,id);
CREATE TABLE IF NOT EXISTS best_answers (
  question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  answer_id INTEGER NOT NULL,
  FOREIGN KEY (question_id,answer_id) REFERENCES answers(question_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS answer_likes (
  answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (answer_id,user_id)
);
CREATE INDEX IF NOT EXISTS answer_likes_user_idx ON answer_likes(user_id);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer_id INTEGER NOT NULL UNIQUE REFERENCES answers(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id,is_read,created_at DESC);
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

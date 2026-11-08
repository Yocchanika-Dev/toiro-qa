-- 将来のログイン追加時に、投稿とユーザーを関連付けられる設計。
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  display_name VARCHAR(50) NOT NULL,
  email VARCHAR(254) UNIQUE NOT NULL,
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

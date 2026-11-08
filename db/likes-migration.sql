-- いいねの件数は保存した行のCOUNTで算出する。複合主キーで重複を防ぐ。
CREATE TABLE IF NOT EXISTS answer_likes (
  answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (answer_id,user_id)
);
CREATE INDEX IF NOT EXISTS answer_likes_user_idx ON answer_likes(user_id);

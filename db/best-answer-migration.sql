-- 質問ごとに選べる回答は1つ。複合外部キーで別質問の回答の選択も防ぐ。
CREATE UNIQUE INDEX IF NOT EXISTS answers_question_id_id_idx ON answers(question_id,id);
CREATE TABLE IF NOT EXISTS best_answers (
  question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  answer_id INTEGER NOT NULL,
  FOREIGN KEY (question_id,answer_id) REFERENCES answers(question_id,id) ON DELETE CASCADE
);

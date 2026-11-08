-- 既存の質問も未解決として保持する。投稿内容や所有者は変更しない。
ALTER TABLE questions ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved'));

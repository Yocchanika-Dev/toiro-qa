# 第5回：Delete — 質問と関連回答の削除

目標：確認画面と削除実行の違い、所有者条件、外部キーを説明する。

## 基礎と実コード

[app.js](../../app.js) 221〜235行を読む。

- `GET /questions/:id/delete`：対象と所有者を確認し、[views/delete.ejs](../../views/delete.ejs) を表示する。削除しない。
- `POST /questions/:id/delete`：もう一度対象と所有者を確認し、DELETEを実行する。

```sql
DELETE FROM questions WHERE id=$1 AND user_id=$2 RETURNING id
```

値は `[req.params.id, req.user.id]`。削除結果が空なら404、成功したら一覧へ移動する。

[db/schema.sql](../../db/schema.sql) 21〜28行：回答は `question_id` で質問を参照する。

```sql
question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE
```

外部キーは関連先の整合性を保つ制約。`ON DELETE CASCADE` により、質問が削除されると紐づく回答もPostgreSQLが自動で削除する。質問削除ルートで回答を一件ずつ削除しているわけではない。回答に紐づくいいね・通知・ベストアンサーも外部キーの設定に従い削除される。

## 理解確認（一問ずつ）

1. 削除確認URLを開いただけでデータが消える？ 実行するのはどのルート？
2. `$1` と `$2` が制限しているものは？
3. 回答の削除連動を定めるファイルと列は？ 別の質問の回答も消える？

## 本人操作・メモ

今回作った確認用質問にBで回答を2件付ける。Aで削除をキャンセルして質問・回答が残ることを確認後、削除を確定する。対象質問が開けず、別の確認用質問は残ることを確認する。
画面で確認した範囲とDBで確認した範囲は区別し、DBを直接調べていなければそう記録する。既存質問19〜21には削除操作をしない。

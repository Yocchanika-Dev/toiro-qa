# 第4回：Update — 質問編集

目標：更新対象・所有者・入力値・SQLの条件を説明する。

## 基礎と実コード

[app.js](../../app.js) の `GET /questions/:id/edit` は編集フォームの表示、211〜220行の `POST /questions/:id/edit` は更新処理。
[views/form.ejs](../../views/form.ejs) は `editing` が真なら送信先を `/questions/質問ID/edit` にする。

1. `requireUser` でログイン確認。
2. `getQuestion(req.params.id)` で対象取得。形式不正・存在しない対象は404。
3. `question.user_id !== req.user.id` なら403。本人以外を拒否。
4. `validate` で編集値を検証。投稿者名は `question.author_name` を維持。
5. UPDATEし、成功後は詳細へ303リダイレクト。

```sql
UPDATE questions
SET title=$1, content=$2, category=$3, updated_at=CURRENT_TIMESTAMP
WHERE id=$4 AND user_id=$5 RETURNING id
```

値は `[data.title, data.content, data.category, question.id, req.user.id]`。
`SET` は変更内容、`WHERE` は対象を限定する条件。IDだけでなく所有者もSQL条件に含める。
画面で編集ボタンを隠すだけでは、URLや送信先を直接指定できるため不十分。サーバーでも権限を検査する。

## 理解確認（一問ずつ）

1. 質問12を編集するとき、12はどこから受け取る？
2. `SET` と `WHERE` はそれぞれ何を決める？ `$4` と `$5` は？
3. 他人の編集URLを直接開いた場合、どこで拒否する？ POSTでも確認する理由は？

## 本人操作・メモ

Aで今回作った質問のタイトル・本文・カテゴリを編集して再読み込みする。別ブラウザ／別プロファイルのBでAの編集URLを開き、拒否されることを確認する。同じプロファイルのタブはCookieを共有する。
[進捗](PROGRESS.md) に本人の説明と操作結果を別々に残す。

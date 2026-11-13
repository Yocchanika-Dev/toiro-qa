# 第2回：Create — 質問投稿

目標：フォームの値・ログイン情報・検証・INSERTをコードで説明する。

## 基礎と実コード

POSTはサーバーへデータを送るHTTPメソッド。webbitでは変更処理に使用する。フォームの `name` が送信する項目名になる。
[views/form.ejs](../../views/form.ejs) 4〜9行を開く。新規投稿では送信先が `/questions`、入力名は `title`・`category`・`content`。`_csrf` も送信する。

[app.js](../../app.js) 25行の `express.urlencoded` がフォーム本文を解析し、`req.body.title` などで読めるようにする。160〜165行の `POST /questions` を読む。

```js
const { data, errors } = validate({ ...req.body, author_name: req.user.display_name });
```

`...req.body` はフォーム値を展開する。後に置く `author_name` が投稿者名を上書きする。`req.user` は [auth.js](../../auth.js) のSession確認で取得したログインユーザー。投稿者名をフォームから自由に指定させない。

`validate`（116〜127行）は値を整え、必須・長さ・カテゴリを検査する。`errors.length` があれば422でフォームを再表示し、`return` で終了するためINSERTへ進まない。ブラウザの `required` だけに頼らずサーバーでも検証する。

```sql
INSERT INTO questions (title, content, author_name, category, user_id)
VALUES ($1,$2,$3,$4,$5) RETURNING id
```

| SQLの位置 | 値の配列の要素 |
| --- | --- |
| $1 | data.title |
| $2 | data.content |
| $3 | data.author_name |
| $4 | data.category |
| $5 | req.user.id |

SQLと値を分けてpgへ渡す。入力をSQL命令に組み込まないための方法。`RETURNING id` で採番されたIDを受け取り、`rows[0].id` へ303リダイレクトする。ブラウザはその詳細画面をGETする。

## 理解確認（一問ずつ）

1. 投稿者名の入力欄がないのに、なぜ保存できる？ `req.body` と `req.user` を使って説明する。
2. `name="title"` はサーバーのどの値に対応する？
3. エラー時にDBへ保存しないコードはどこ？
4. `$1`〜`$5` と値の配列の順序、`RETURNING id` の目的は？

## 本人操作・メモ

専用アカウントで確認用質問を1件作り、一覧と詳細を確認する。作成した質問IDと操作結果を [進捗](PROGRESS.md) に記録する。パスワードなどは記録しない。

# ソースコード解説動画：収録ガイド

作成：2026-11-08。対象コード：`c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9`。
以下は読み上げ用の下書き。本人がコードを確認し、自分の言葉に直してから収録する。動画そのものは未収録。

## 収録前の準備

- [ ] `PERSONAL_REVIEW.md` の操作・理解確認を終える。
- [ ] GitHubをブラウザで開き、コードの文字と行番号が読める倍率にする。
- [ ] アプリにニックネームでログインする。録画開始前に認証を済ませる。
- [ ] 確認用の質問を1つ用意し、回答を付けておく。削除の実演にはその投稿だけを使う。
- [ ] 個人メール・実名・パスワード・`.env`・VercelやNeonの認証情報が映らない画面にする。
- [ ] マイク音声も録音されることを短い試し録りで確認する。
- [ ] 台本とコードを並べ、指す行を確認する。名前・出席番号は提出フォームに入力し、この台本には書かない。

## 開いておくコード

リンクは確認済みコミットに固定。行番号が変わった場合も、リンク先と実際に説明するコードを揃える。

| 用途 | GitHubで表示する場所 |
| --- | --- |
| ファイル構成 | [リポジトリ](https://github.com/Yocchanika-Dev/toiro-qa/tree/c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9) |
| フォーム | [views/form.ejs 4〜10行](https://github.com/Yocchanika-Dev/toiro-qa/blob/c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9/views/form.ejs#L4-L10) |
| フォーム値の解析 | [app.js 17行](https://github.com/Yocchanika-Dev/toiro-qa/blob/c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9/app.js#L17) |
| 入力検証・質問取得 | [app.js 86〜100行](https://github.com/Yocchanika-Dev/toiro-qa/blob/c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9/app.js#L86-L100) |
| Create | [app.js 113〜118行](https://github.com/Yocchanika-Dev/toiro-qa/blob/c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9/app.js#L113-L118) |
| Update | [app.js 161〜170行](https://github.com/Yocchanika-Dev/toiro-qa/blob/c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9/app.js#L161-L170) |
| 削除確認・Delete | [app.js 171〜185行](https://github.com/Yocchanika-Dev/toiro-qa/blob/c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9/app.js#L171-L185) |
| 質問と回答の関連 | [db/schema.sql 21〜28行](https://github.com/Yocchanika-Dev/toiro-qa/blob/c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9/db/schema.sql#L21-L28) |
| DB接続 | [db/pool.js](https://github.com/Yocchanika-Dev/toiro-qa/blob/c37aa0ba2586e08cd9218c8b087bf5c0b9f7d7c9/db/pool.js) |

## 5分程度の構成と読み上げ例

目安は合計5分。話す速さと画面切り替えで前後するため、試し録りして調整する。コードを指しながら説明し、操作だけの動画にしない。

### 0:00〜0:20：概要

表示：リポジトリのファイル一覧。

> Q&Aアプリ「webbit」の登録・更新・削除を説明します。Node.jsとExpressでリクエストを処理し、EJSで画面を作り、pgからPostgreSQLを操作しています。

### 0:20〜1:55：Create（登録・最大7点）

表示：`views/form.ejs` → `app.js` の17行・86〜97行 → 113〜118行。

> 登録フォームのmethodはPOST、送信先は`/questions`です。入力欄のnameは`title`、`category`、`content`です。
>
> `app.js`の`express.urlencoded`がフォーム値を解析し、`req.body`から読めるようにします。
>
> 登録処理は`app.post('/questions', ...)`です。`requireUser`でログインを確認します。投稿者名はフォーム値ではなく、`req.user.display_name`を使います。
>
> `validate`で空欄・文字数・カテゴリを検査し、エラーがあれば422でフォームを表示し直します。DBには保存しません。
>
> 正常な値は`data`に入ります。`pool.query`でINSERTを実行し、`$1`から`$5`へ、タイトル・内容・投稿者名・カテゴリ・ユーザーIDを順に渡します。SQLと値の配列を分けています。
>
> `await`で保存を待ち、`RETURNING id`で質問IDを取得します。`rows[0].id`を使い、303で詳細ページへ移動します。

指す場所：フォームの`name` → `req.body` → `data`と`errors` → `INSERT`と値の配列 → `rows[0].id`。

### 1:55〜3:15：Update（更新・最大7点）

表示：`app.js`の98〜100行と161〜170行。必要に応じフォーム4行。

> 更新の送信先は`/questions/:id/edit`です。質問12ならURLは`/questions/12/edit`となり、`req.params.id`で12を受け取ります。
>
> `getQuestion`がIDの形式を検査し、`SELECT ... WHERE id=$1`で質問を取得します。なければ404です。
>
> `question.user_id`と`req.user.id`を比較し、他人の質問なら403で拒否します。URLを直接指定しても変更できません。
>
> フォーム値を`validate`で検証し、タイトル・内容・カテゴリを更新します。投稿者名は元の値を引き継ぎます。
>
> `UPDATE questions SET`で3項目と更新日時を変更します。配列の`$1`から順にタイトル・内容・カテゴリ、`$4`は質問ID、`$5`はユーザーIDです。
>
> `WHERE id=$4 AND user_id=$5`で対象と所有者を限定します。更新後は詳細ページへ移動し、保存された内容を表示します。

指す場所：`req.params.id` → `getQuestion` → 所有者比較 → `UPDATE`の`SET`と`WHERE` → 値の配列。

### 3:15〜4:40：Delete（削除・最大6点）

表示：`app.js`の171〜185行 → `db/schema.sql`の21〜28行。

> GETの`/questions/:id/delete`は削除確認の表示だけです。確認後のPOSTで実際に削除します。
>
> POSTでも`req.params.id`で質問を取得し、存在するか、投稿者本人かを確認します。
>
> `DELETE FROM questions WHERE id=$1 AND user_id=$2`で、質問IDと自分のユーザーIDが一致する行だけを消します。`RETURNING id`が空なら404です。
>
> 回答との関連は`db/schema.sql`です。`answers.question_id`は`questions.id`を参照する外部キーで、`ON DELETE CASCADE`を指定しています。
>
> そのため、質問を消すと、紐づく回答もPostgreSQLが自動で削除します。回答を別のDELETE文で1件ずつ消しているわけではありません。
>
> いいねや通知も削除連動し、削除済み回答へのデータが残りません。処理後は質問一覧へ移動します。

指す場所：GETとPOSTの違い → `DELETE`の条件 → `answers.question_id` → **`ON DELETE CASCADE`**。

### 4:40〜5:00：まとめ・AI利用の開示

表示：リポジトリの一覧またはREADME。

> 登録ではフォーム値を検証し、更新・削除ではIDと所有者を確認しています。関連データは外部キーで連動させています。設計とコードの初稿にはCodexを利用しました。以上です。

AI利用の説明は、本人が実際に行った確認・修正の内容に合わせて補足する。「すべて自分で書いた」「自分で修正した」など、事実と違う説明を追加しない。

## 収録前に答える6問

台本を閉じ、対応するコードを指して説明できるか確認する。

1. フォームの`name="title"`は、サーバーでどの値になるか。
2. `req.body`と`req.params.id`は、それぞれどこから来るか。
3. Createの`$1`〜`$5`には、何がどの順に入るか。
4. Updateで`id`と`user_id`の両方を条件にする理由は何か。
5. 削除確認画面を開いただけで、質問が削除されるか。
6. 質問を消したときに回答も消える設定は、どのファイルのどこにあるか。

答え：1は`req.body.title`。2はフォーム本文とURL。3はタイトル・内容・投稿者名・カテゴリ・ユーザーID。4は対象の特定と所有者の制限。5は削除されず、確認後のPOSTで削除。6は`db/schema.sql`の`answers.question_id`にある`ON DELETE CASCADE`。

## 録画後の確認

- [ ] GitHub上の実際のソースコードと行番号が読める。
- [ ] 本人の声が入り、5分程度に収まっている。
- [ ] Createの受け取り・検証・DB保存を、実際の変数や関数を使って説明した。
- [ ] Updateの対象ID・所有者確認・DB更新を説明した。
- [ ] Deleteの対象ID・DB削除・関連回答の扱いを説明した。
- [ ] 個人情報・認証情報が映っていない。
- [ ] MP4などMacで視聴できる形式で、ファイルは1GB以内。
- [ ] 提出する動画を最後まで再生して確認した。

動画未提出は解説動画の20点分が0点。フォームでは動画ファイル1個を添付する。

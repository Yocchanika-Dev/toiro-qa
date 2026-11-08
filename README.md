# といろ — 授業Q&A

Node.js / Express / EJS / PostgreSQL / pg を使用した、質問と回答を共有するWebアプリ。

## 起動

Node.js 22.9以上とPostgreSQLが必要。

この端末では専用のPostgreSQLを設定済み。`npm start` でアプリを起動できる。DBが停止している場合は `npm run db:local` で再起動する。データは `.local/postgres`、接続情報は `.env` に保存され、どちらもGit対象外。DBはローカル専用ポート55432で待ち受ける。

別の環境で初めて設定する場合：

```sh
npm install
cp .env.example .env
```

PostgreSQLに専用DB `class_qa` を用意し、`.env` の `DATABASE_URL` をその接続先に変更する。認証情報はコミットしない。

```sh
npm run db:init
npm start
```

`http://localhost:3000` を開く。`db:init` はテーブル作成のみで、既存データを消さない。スキーマを変更した際のマイグレーション機能ではない。

画面だけ先に確認する場合は `npm run preview`。サンプル投稿を入れたメモリ上のDBで動作し、終了するとデータは消える。課題提出用の永続DBではない。

## 現在の実装

- 質問の投稿・新しい順の一覧・詳細・編集・削除確認
- 質問削除に連動した回答削除（外部キー `ON DELETE CASCADE`）
- 複数回答の投稿・質問別表示・削除
- タイトル／内容のキーワード検索・カテゴリ絞り込み・0件表示
- サーバー側必須／文字数／カテゴリ検証、404、SQLプレースホルダー、HTMLエスケープ
- 将来のログイン用usersテーブルと、質問・回答の任意user_id

ログイン・権限管理などの発展機能は未実装。現段階は基本課題仕様のため、アクセスできる人は質問・回答を編集・削除できる。

## 検証

```sh
npm test
```

HTTP経由で質問CRUD・回答・検索・別質問への回答混入防止・関連回答削除・不正入力・HTMLエスケープ・別サイトからのPOST拒否を確認する。テストのDBは `pg-mem` によるメモリ上の互換実装。実PostgreSQLでの互換性・再起動後の保持は別途確認が必要。

実PostgreSQLを使う検証は `npm run test:postgres`。専用テストスキーマを作成し、完了時にそのスキーマのみ削除する。アプリ再起動後の保持は `node --env-file=.env scripts/check-persistence.js` で確認する。2026-11-08に両方成功済み。

## 公開準備

Node.jsプロセスを実行できるホスティングとPostgreSQLを用意する。起動コマンドは `npm start`、初期化は `npm run db:init`。環境変数 `DATABASE_URL`、`APP_ORIGIN`（公開URL、末尾スラッシュなし）、必要に応じ `PORT` を設定する。接続TLSはプロバイダーの正式な接続文字列・証明書設定に従い、証明書検証を無効化しない。

公開後は `/health` と、CRUD・検索・回答を確認する。ソースコードはGitHub公開済み。Vercelへのデプロイはログイン待ち。

Vercel向けエントリーポイントは `api/index.js`。専用の公開PostgreSQL接続先を環境変数 `DATABASE_URL` に設定する。ローカルの `.env` や `.local` をアップロードしない。ローカルのDBはVercelから接続できない。投稿時の名前はニックネームを使用する。

## コード解説の入口

- `db/schema.sql`：質問と回答の外部キー、質問削除時の回答削除
- `app.js` のCreate：フォーム値の受け取り、検証、`INSERT ... RETURNING id`
- Update：URLのIDで対象を取得し、`UPDATE ... WHERE id=$4`
- Delete：`DELETE ... WHERE id=$1` と外部キーによる削除連動

## AI利用

2026-11-07：Codexを使用し、DB設計、コード・画面・テスト・文書の初稿を生成。本人による内容理解・動作検証・必要な修正は未完了。提出時は実際の利用内容に合わせ、学校AIガイドラインに従って開示する。

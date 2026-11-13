# webbit 学習ガイド

作成：2026-11-14。コード照合基準：`0c389f9`。
目的は実コードを理解し、GitHubのコードを示しながら本人の言葉で登録・更新・削除を説明して提出すること。

**ChatGPT・Codex共通の入口は [START_HERE.md](START_HERE.md)。** 次回の問題は [学習進捗](PROGRESS.md) を読む。アプリの実装・テスト履歴は [ルートのPROGRESS.md](../../PROGRESS.md) に分ける。

## 進め方

各回は「基礎 → 実コード → 一問ずつ理解確認 → 本人操作 → 記録」。30〜45分は目安。回答前に正答を読み上げず、本人の説明を聞いて必要な箇所を補う。

| 回 | 教材 | 目標 |
| --- | --- | --- |
| 1 | [Webアプリの全体像](01-overview.md) | ブラウザ・サーバー・DBの役割を説明する |
| 2 | [Create](02-create.md) | フォームからINSERTまで追う |
| 3 | [Read・検索](03-read.md) | SELECT・検索条件・表示を追う |
| 4 | [Update](04-update.md) | 対象ID・所有者・UPDATEを説明する |
| 5 | [Delete](05-delete.md) | 確認画面・DELETE・回答の削除連動を説明する |
| 6 | [DB・認証・安全対策](06-security.md) | Session・外部キー・防御の役割を説明する |
| 7 | [発展7項目](07-features.md) | 各機能の画面と保存処理を対応させる |
| 8 | [復習・動画・提出](08-submission.md) | 自分の説明で動画と提出物を完成させる |

## コードを開く

教材の相対リンクは同じブランチのファイルを開く。行番号は `0c389f9` 時点。変更後は関数名・ルート・SQLで探し直す。
[照合基準のソース](https://github.com/Yocchanika-Dev/toiro-qa/tree/0c389f9)も参照できる。
ローカルの `qa-site/` がGitHubのルートに相当する。

`server.js` はローカル起動用。本番Vercelの入口は [api/index.js](../../api/index.js)。教材では共通の `createApp(pool)` 内を中心に読む。

## 記録と公開範囲

- 教材を用意したことと、本人が理解したことを区別する。
- 学習状態（未学習／説明済み／理解確認中／本人が説明可能）と、本人操作の状態を別々に記録する。
- 日付・問題・回答要約・確認結果・次回の一問を残す。根拠がなければ未確認のままにする。
- 公開してよい技術メモだけを残す。実名・メール・認証情報・会話全文・個人的な相談は記録しない。
- 既存の質問19〜21と質問19の回答2件は保持。操作には今回作った専用投稿だけを使い、その投稿だけ片付ける。
- 学習のためにアプリコードへコメントを書き込む必要はない。まず進捗のメモ欄に書く。

## Gitで共有するとき

共有ブランチは `study-notes`。本番の `main` とは分ける。
このブランチの `vercel.json` は `git.deploymentEnabled.study-notes=false` で学習ブランチの自動デプロイを無効にする。手動デプロイは行わない。
設定の根拠：[Vercel Git Configuration](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled)。ダッシュボードのIgnored Build Step保存状態とは別の設定。
開始・終了・競合時の手順は [START_HERE.md](START_HERE.md)。教材の変更と本人の学習記録は別Commitにする。

課題条件の基準は作業フォルダ直下の `REQUIREMENTS.md`（リポジトリ外）。外部の学習者向けの提出要点は第8回へ。変更時は基準資料と照合する。

AI利用：2026-11-14、Codexが本人提供のChatGPT学習引き継ぎを整理し、現コードと照合して本教材を作成。本人の理解確認は別途行う。

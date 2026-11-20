# 第1回：質問一覧表示の流れを本人が再説明

記録ID：2026-11-20-1106-flow-explanation（JST、学習会話の時刻を基準）
日時：2026-11-20（JST）
担当：ChatGPT（GPT-6）
開始時ブランチ：study-notes
開始時コミット：`e83b779eb375fb330c5e9a13c996a1f3474ed8cc`
開始時進捗リビジョン：`learning-0003`
使用した資料：`docs/learning/START_HERE.md`、`PROGRESS.md`、`01-overview.md`、`app.js`（study-notes）；Notion授業資料#1 backend、#2 req/res、#11 Express、#16 pg
Notion教材の参照状況：#1・#2・#11・#16のページ本文を2026-11-20に再取得。4ページとも本文取得可。画像・添付の確認は未実施。残り18件は2026-11-19の22件参照記録を再利用し、今回の更新の有無は未確認。
前回参照記録を再利用した場合：[2026-11-19-1125-notion-review.md](2026-11-19-1125-notion-review.md)。この記録では当時22件の本文を取得。
学習回・問題：第1回。ブラウザから質問一覧を表示する一連の流れを説明する。

## 本人の回答と確認

- 「ブラウザは最初に何をどこへ送る？」：最初は「ExpressにHTML生成？」と回答。説明を受けた後、「Expressサーバーに『質問一覧を見せて』と要求する」と正しく再回答。
- 「Expressサーバーはどこに問い合わせる？」：「PostgreSQL」と正答。
- 「PostgreSQLからデータが返った後、HTMLを生成するメソッドは？」：最初は「Create post」と回答。コードと選択肢による説明後「B（`res.render()`）」と正答。
- 「生成されたHTMLは最終的にどこへ？」：「ブラウザ」と正答。
- 「最初から最後まで説明して（ブラウザ、Express、PostgreSQL、`pool.query()`、`res.render()`を使う）」への本人回答の要約：ブラウザが質問一覧を要求 → Expressが受ける → `pool.query()`でPostgreSQLへ問い合わせる → PostgreSQLがデータを返す → Expressが`res.render()`でEJSによるHTMLを生成 → HTMLをブラウザへ返して表示。

本人の回答要約：処理の順序と、サーバー／DB／EJSの役割を指定語を使って自力で連続説明できた。表現上のわずかな省略はあるが、重要な技術的流れは正確。
AIが補足した内容：`GET /questions`がHTTPリクエストであること、`pool.query()`と`res.render()`の役割の違いを各段階で確認した。
補足後の本人の再説明：上記の一連の流れを本人の言葉で正しく説明（ただし直前の段階的ヒントと5語の手がかりあり）。
確認コード：`app.js` の `app.get('/questions', ...)` → `await pool.query(...)` → `res.render('index', ...)`（study-notes、コードblob `36cbf97b9257e388452aa57a3d4b45d25813f84a`）。
理解確認結果：**質問一覧表示の基本的な処理の流れは説明可能（補助学習後・キーワード提示あり）**。ヒントなしの定着確認、Node.js／Express／pg／PostgreSQL／EJSの役割を一文ずつ説明する第1回Q2、コードとの本人による画面対応確認は未実施。第1回全体を完了とはしない。

本人が操作したこと：今回の範囲でアプリ・GitHubの実機操作の申告なし。チャットで問題への回答と一連の処理の再説明を実施。
根拠：このチャットにおける本人の段階的な回答と最後の連続した説明。本人が画面で操作・検証した証拠はない。
AIのみが操作・検証したこと：GitHubの教材・コードの参照、Notion関連4教材のページ本文確認。学習記録更新はAIによるGit操作。
未解決の疑問：初回は`res.render`をCreate/POSTと混同していたため、少し時間をおいた独立再説明で定着を確認する。第1回Q2と本人操作は未確認。
次回の開始地点：第1回Q2を**一問だけ**。「Node.js・Express・pg・PostgreSQL・EJSの役割を、それぞれ一文で説明すると？」 分からない語は一つずつ説明して再確認する。

保存状態：Git保存済み（GitHubでCommitと読み直しの検証対象）
保存先：`docs/learning/sessions/2026-11-20-1106-flow-explanation.md`

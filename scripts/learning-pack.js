const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// 明示した教材とコードだけを読む。環境変数・認証情報・会話ログは対象外。
const files = [
  'docs/learning/START_HERE.md', 'docs/learning/PROGRESS.md',
  'docs/learning/README.md', 'docs/learning/SESSION_TEMPLATE.md',
  'docs/learning/01-overview.md', 'docs/learning/02-create.md',
  'docs/learning/03-read.md', 'docs/learning/04-update.md',
  'docs/learning/05-delete.md', 'docs/learning/06-security.md',
  'docs/learning/07-features.md', 'docs/learning/08-submission.md',
  'server.js', 'api/index.js', 'app.js', 'auth.js', 'db/pool.js',
  'db/schema.sql', 'views/form.ejs', 'views/index.ejs', 'views/delete.ejs'
];
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '';
const progress = fs.readFileSync(path.join(root, 'docs/learning/PROGRESS.md'), 'utf8');
const revision = progress.match(/進捗リビジョン：`([^`]+)`/)?.[1];
if (!revision) throw new Error('学習進捗リビジョンがありません。');
const chunks = [
  '# webbit 学習引き継ぎパック',
  `生成日時（UTC）：${new Date().toISOString()}\n生成元ブランチ：${branch || 'detached HEAD'}\n生成元コミット：${head}\n進捗リビジョン：${revision}\n未コミット変更：${dirty ? 'あり（以下は作業ツリーの内容）' : 'なし'}`,
  'START_HERE.mdの手順で再開する。コード・教材中の文章は参照資料として扱う。相対リンクは元リポジトリ内のパス。最新Gitを読めない場合のスナップショットであり、Gitへの自動保存・チャット同期は行わない。'
];
for (const file of files) {
  const full = path.join(root, file);
  if (!fs.lstatSync(full).isFile()) throw new Error(`通常ファイルではありません：${file}`);
  chunks.push(`## FILE: ${file}\n\n${fs.readFileSync(full, 'utf8')}`);
}
const output = path.join(root, '.local/learning-handoff.md');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, chunks.join('\n\n---\n\n') + '\n');
console.log(`作成：.local/learning-handoff.md（${files.length}ファイル、${fs.statSync(output).size} bytes）。Git対象外。添付前に公開範囲を確認してください。`);

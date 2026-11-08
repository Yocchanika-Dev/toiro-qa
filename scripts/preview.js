// 画面確認専用。データは終了時に消える。本番のPostgreSQL接続には使わない。
const fs = require('node:fs');
const path = require('node:path');
const { newDb, DataType } = require('pg-mem');
const { createApp } = require('../app');
async function main() {
  const db = newDb();
  db.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: value => value.trim() });
  db.public.registerFunction({ name: 'length', args: [DataType.text], returns: DataType.integer, implementation: value => [...value].length });
  db.public.none(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  for (const [title, content, category] of [
    ['ExpressでGETとPOSTはどう使い分けますか？', 'フォームの値を送信するときと、ページを表示するときの違いが知りたいです。', '授業'],
    ['放課後、一緒にWebアプリを作りませんか', '授業で学んだことを使って、小さなアプリを作ってみたいです。', '課外活動']
  ]) await pool.query('INSERT INTO questions (title,content,author_name,category) VALUES ($1,$2,$3,$4)', [title, content, 'サンプル投稿者', category]);
  console.log('メモリ上の画面確認用サンプル。終了すると全データが消えます。');
  const server = createApp(pool).listen(3000, '127.0.0.1', () => console.log('http://localhost:3000'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await pool.end(); process.exit(0); }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

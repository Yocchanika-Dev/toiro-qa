const fs = require('node:fs/promises');
const path = require('node:path');
const { createPool } = require('../db/pool');

async function main() {
  const pool = createPool();
  try {
    const sql = await fs.readFile(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await pool.query(sql);
    await pool.query(await fs.readFile(path.join(__dirname, '../db/auth-migration.sql'), 'utf8'));
    await pool.query(await fs.readFile(path.join(__dirname, '../db/status-migration.sql'), 'utf8'));
    await pool.query(await fs.readFile(path.join(__dirname, '../db/best-answer-migration.sql'), 'utf8'));
    console.log('テーブルを作成しました。既存データは保持されます。');
  } finally { await pool.end(); }
}
main().catch(() => { console.error('DB初期化に失敗しました。接続先・認証情報・DBの起動状態を確認してください。'); process.exitCode = 1; });

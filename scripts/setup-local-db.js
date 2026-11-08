// 課題専用クラスタを作成する。既存のPostgreSQLデータには触れない。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const root = path.join(__dirname, '..');
const local = path.join(root, '.local');
const bin = process.env.PG_BIN || '/opt/homebrew/opt/postgresql@18/bin';
const data = path.join(local, 'postgres');
const envFile = path.join(root, '.env');

function run(command, args) {
  const result = spawnSync(path.join(bin, command), args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command}に失敗しました。${result.stderr || result.stdout || ''}`);
}
async function main() {
  fs.mkdirSync(local, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(data)) {
    if (fs.existsSync(envFile)) throw new Error('既存の.envがあります。上書きせず停止しました。');
    const password = crypto.randomBytes(24).toString('hex');
    const passwordFile = path.join(local, 'init-password');
    fs.writeFileSync(passwordFile, password, { mode: 0o600 });
    try { run('initdb', ['-D', data, '-U', 'qa_local', '-A', 'scram-sha-256', '--pwfile', passwordFile, '--encoding=UTF8', '--locale=C']); }
    finally { fs.unlinkSync(passwordFile); }
    fs.writeFileSync(envFile, `DATABASE_URL=postgresql://qa_local:${password}@127.0.0.1:55432/class_qa\nPORT=3000\nAPP_ORIGIN=http://localhost:3000\n`, { mode: 0o600, flag: 'wx' });
  }
  const status = spawnSync(path.join(bin, 'pg_ctl'), ['-D', data, 'status']);
  if (status.status !== 0) run('pg_ctl', ['-D', data, '-l', path.join(local, 'postgres.log'), '-o', "-h 127.0.0.1 -p 55432 -k ''", '-w', 'start']);
  const content = fs.readFileSync(envFile, 'utf8');
  const connectionString = content.match(/^DATABASE_URL=(.+)$/m)?.[1];
  if (!connectionString) throw new Error('.envにDATABASE_URLがありません。');
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname='class_qa'");
    if (!exists.rowCount) await client.query('CREATE DATABASE class_qa');
  } finally { await client.end(); }
  console.log('課題専用PostgreSQLを127.0.0.1:55432で起動しました。認証情報は.envに保存済みです。');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

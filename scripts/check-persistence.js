const { spawn } = require('node:child_process');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { createPool } = require('../db/pool');
const origin = 'http://127.0.0.1:3002';
let child;
async function start() {
  child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '3002', APP_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'] });
  let failed = false;
  child.on('exit', () => { failed = true; });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (failed) throw new Error('検証用アプリを起動できません。');
    try { if ((await fetch(origin + '/health')).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('検証用アプリの起動がタイムアウトしました。');
}
async function stop() {
  if (child && child.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill('SIGTERM');
    await ended;
  }
}
async function main() {
  const pool = createPool();
  const marker = `永続化検証-${randomUUID()}`;
  try {
    await start();
    const result = await fetch(origin + '/questions', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ title: marker, author_name: '自動検証', content: 'アプリ再起動後の保存確認', category: 'その他' }) });
    assert.equal(result.status, 303);
    const location = result.headers.get('location');
    await stop();
    await start();
    const response = await fetch(origin + location);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(marker));
    console.log('実PostgreSQL：アプリ再起動後も質問が保持されることを確認しました。');
  } finally {
    await stop();
    await pool.query('DELETE FROM questions WHERE title=$1', [marker]);
    await pool.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

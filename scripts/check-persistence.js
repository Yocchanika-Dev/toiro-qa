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
  const loginId = 'persist_' + randomUUID().replace(/-/g, '').slice(0, 16);
  const password = randomUUID();
  const responderId = loginId + '_b';
  try {
    await start();
    const registered = await fetch(origin + '/register', { method: 'POST', redirect: 'manual', headers: { origin }, body: new URLSearchParams({ login_id: loginId, display_name: '自動検証', password, password_confirm: password }) });
    assert.equal(registered.status, 303);
    const cookie = registered.headers.get('set-cookie').split(';')[0];
    const page = await (await fetch(origin + '/questions', { headers: { cookie } })).text();
    const csrf = page.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
    const result = await fetch(origin + '/questions', { method: 'POST', redirect: 'manual', headers: { origin, cookie }, body: new URLSearchParams({ _csrf: csrf, title: marker, content: 'アプリ再起動後の保存確認', category: 'その他' }) });
    assert.equal(result.status, 303);
    const location = result.headers.get('location');
    const changed = await fetch(origin + location + '/status', { method: 'POST', redirect: 'manual', headers: { origin, cookie }, body: new URLSearchParams({ _csrf: csrf, status: 'resolved' }) });
    assert.equal(changed.status, 303);
    const answered = await fetch(origin + location + '/answers', { method: 'POST', redirect: 'manual', headers: { origin, cookie }, body: new URLSearchParams({ _csrf: csrf, content: 'ベストアンサー保持の確認' }) });
    assert.equal(answered.status, 303);
    const answerId = (await pool.query('SELECT id FROM answers WHERE question_id=$1', [location.split('/').pop()])).rows[0].id;
    const selected = await fetch(origin + location + '/best-answer', { method: 'POST', redirect: 'manual', headers: { origin, cookie }, body: new URLSearchParams({ _csrf: csrf, answer_id: answerId }) });
    assert.equal(selected.status, 303);
    const liked = await fetch(origin + location + '/answers/' + answerId + '/like', { method: 'POST', redirect: 'manual', headers: { origin, cookie }, body: new URLSearchParams({ _csrf: csrf, action: 'add' }) });
    assert.equal(liked.status, 303);
    const secondUser = await fetch(origin + '/register', { method: 'POST', redirect: 'manual', headers: { origin }, body: new URLSearchParams({ login_id: responderId, display_name: '回答検証用', password, password_confirm: password }) });
    assert.equal(secondUser.status, 303);
    const cookieB = secondUser.headers.get('set-cookie').split(';')[0];
    const pageB = await (await fetch(origin + '/questions', { headers: { cookie: cookieB } })).text();
    const csrfB = pageB.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
    const newAnswer = await fetch(origin + location + '/answers', { method: 'POST', redirect: 'manual', headers: { origin, cookie: cookieB }, body: new URLSearchParams({ _csrf: csrfB, content: '再起動後の通知を確認' }) });
    assert.equal(newAnswer.status, 303);
    const noticeId = (await pool.query('SELECT id FROM notifications WHERE answer_id IN (SELECT id FROM answers WHERE question_id=$1)', [location.split('/').pop()])).rows[0].id;
    const marked = await fetch(origin + '/notifications/' + noticeId + '/read', { method: 'POST', redirect: 'manual', headers: { origin, cookie }, body: new URLSearchParams({ _csrf: csrf, state: 'read' }) });
    assert.equal(marked.status, 303);
    await stop();
    await start();
    const response = await fetch(origin + location, { headers: { cookie } });
    assert.equal(response.status, 200);
    const detail = await response.text();
    assert.ok(detail.includes(marker));
    assert.ok(detail.includes('ログアウト'));
    assert.ok(detail.includes('編集する'));
    assert.ok(detail.includes('未解決に戻す'));
    assert.ok(detail.includes('質問者が選んだ回答'));
    assert.ok(detail.includes(`data-like-answer-id="${answerId}" data-like-count="1" data-liked="true"`));
    const notifications = await (await fetch(origin + '/notifications', { headers: { cookie } })).text();
    assert.ok(notifications.includes(`data-notification-id="${noticeId}" data-read="true"`));
    const unread = await fetch(origin + '/notifications/' + noticeId + '/read', { method: 'POST', redirect: 'manual', headers: { origin, cookie }, body: new URLSearchParams({ _csrf: csrf, state: 'unread' }) });
    assert.equal(unread.status, 303);
    await stop(); await start();
    const restored = await (await fetch(origin + '/notifications', { headers: { cookie } })).text();
    assert.ok(restored.includes(`data-notification-id="${noticeId}" data-read="false"`));
    console.log('実PostgreSQL：通知の既読・未読、既存機能とSessionがアプリ再起動後も保持されることを確認しました。');
  } finally {
    await stop();
    await pool.query('DELETE FROM questions WHERE title=$1', [marker]);
    await pool.query('DELETE FROM users WHERE login_id=$1', [loginId]);
    await pool.query('DELETE FROM users WHERE login_id=$1', [responderId]);
    await pool.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

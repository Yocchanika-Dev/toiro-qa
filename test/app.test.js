const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newDb, DataType } = require('pg-mem');
const { createApp } = require('../app');

test('質問・回答・検索・削除連動とエラー処理', async t => {
  let pool;
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const schema = `qa_test_${Date.now()}_${process.pid}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
    await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  } else {
  const db = newDb();
  // pg-memに未実装のPostgreSQL標準関数を補う。
  db.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: value => value.trim() });
  db.public.registerFunction({ name: 'length', args: [DataType.text], returns: DataType.integer, implementation: value => [...value].length });
  db.public.none(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  const { Pool } = db.adapters.createPg();
  pool = new Pool();
  t.after(() => pool.end());
  }
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); });
  const get = url => fetch(base + url);
  const post = (url, data, headers = {}) => fetch(base + url, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual', headers });
  let response = await get('/questions');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /まだ質問がありません/);
  response = await post('/questions', { title: ' ', content: ' ', category: '不正' });
  assert.equal(response.status, 422);
  assert.equal((await pool.query('SELECT * FROM questions')).rows.length, 0);
  response = await post('/questions', { title: '<script>alert(1)</script>', content: 'Expressの質問', author_name: 'テスト', category: '授業' });
  assert.equal(response.status, 303);
  const url = response.headers.get('location');
  response = await get(url);
  const html = await response.text();
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  response = await get(url + '/edit'); assert.equal(response.status, 200);
  response = await post(url + '/edit', { title: 'DBの質問', content: '更新内容', category: 'その他' });
  assert.equal(response.status, 303);
  assert.equal((await pool.query('SELECT * FROM questions')).rows[0].title, 'DBの質問');
  for (const content of ['回答その1', '回答その2']) {
    response = await post(url + '/answers', { author_name: '回答者', content });
    assert.equal(response.status, 303);
  }
  response = await post(url + '/answers', { author_name: '回答者', content: '' });
  assert.equal(response.status, 422);
  response = await post('/questions', { title: '別の質問', content: '別内容', author_name: '別の人', category: '課外活動' });
  const other = response.headers.get('location');
  const otherId = Number(other.split('/').pop());
  response = await get(other); assert.doesNotMatch(await response.text(), /回答その1/);
  response = await get('/questions?q=DB&category=' + encodeURIComponent('その他'));
  assert.equal(response.status, 200);
  const search = await response.text(); assert.match(search, /DBの質問/); assert.doesNotMatch(search, /別の質問/);
  response = await get('/questions?q=見つからない'); assert.match(await response.text(), /条件に合う質問が見つかりませんでした/);
  if (process.env.TEST_DATABASE_URL) {
    for (const literal of ['%', '_', '\\']) {
      response = await get('/questions?q=' + encodeURIComponent(literal));
      assert.equal(response.status, 200);
      assert.match(await response.text(), /条件に合う質問が見つかりませんでした/);
    }
  }
  response = await get('/questions');
  const listing = await response.text(); assert.ok(listing.indexOf('別の質問') < listing.indexOf('DBの質問'));
  const answers = (await pool.query('SELECT * FROM answers ORDER BY id')).rows;
  response = await post(other + '/answers/' + answers[0].id + '/delete', {});
  assert.equal(response.status, 404);
  assert.equal((await pool.query('SELECT * FROM answers')).rows.length, 2);
  response = await post(url + '/answers/' + answers[0].id + '/delete', {});
  assert.equal(response.status, 303);
  response = await get(url + '/delete'); assert.match(await response.text(), /この操作は取り消せません/);
  response = await post(url + '/delete', {}); assert.equal(response.status, 303);
  assert.equal((await pool.query('SELECT * FROM answers')).rows.length, 0);
  assert.equal((await pool.query('SELECT * FROM questions')).rows[0].id, otherId);
  for (const target of [url, '/questions/abc', '/questions/999999999999999999999', '/missing']) {
    assert.equal((await get(target)).status, 404);
  }
  response = await post(other + '/delete', {}, { origin: 'https://example.com' }); assert.equal(response.status, 403);
  assert.equal((await get(other)).status, 200);
});

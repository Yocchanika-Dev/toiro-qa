// 公開環境の動作検証。今回作成した検証用投稿だけを最後に削除する。
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const origin = process.env.PUBLIC_BASE_URL;
if (!origin || !origin.startsWith('https://')) throw new Error('PUBLIC_BASE_URLに検証対象のHTTPS URLを指定してください。');
const marker = `動作検証-${randomUUID()}`;
const created = [];
const accounts = [];
let cookie = '', csrf = '';
const get = url => fetch(origin + url, { headers: { cookie }, signal: AbortSignal.timeout(20000), redirect: 'manual' });
const post = (url, data, headers = {}) => fetch(origin + url, { method: 'POST', body: new URLSearchParams({ _csrf: csrf, ...data }), redirect: 'manual', headers: { origin, cookie, ...headers }, signal: AbortSignal.timeout(20000) });
async function adopt(response) {
  cookie = response.headers.get('set-cookie').split(';')[0];
  csrf = (await (await get('/questions')).text()).match(/name="_csrf" value="([a-f0-9]+)"/)[1];
}
async function register() {
  cookie = ''; csrf = '';
  const account = { login_id: 'check_' + randomUUID().replace(/-/g, '').slice(0, 20), password: randomUUID() };
  const response = await post('/register', { ...account, display_name: '動作確認用', password_confirm: account.password });
  assert.equal(response.status, 303);
  assert.match(response.headers.get('set-cookie'), /__Host-toiro_session=/);
  assert.match(response.headers.get('set-cookie'), /Secure/);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  await adopt(response);
  Object.assign(account, { cookie, csrf }); accounts.push(account);
  return account;
}
async function main() {
  try {
    assert.equal((await get('/health')).status, 200);
    assert.equal((await get('/style.css')).status, 200);
    assert.equal((await get('/.env')).status, 404);
    assert.equal((await get('/.local/postgres/PG_VERSION')).status, 404);
    assert.equal((await post('/questions', {})).status, 401);
    const accountA = await register();
    for (const suffix of ['A', 'B']) {
      const response = await post('/questions', { title: marker + suffix, content: '公開環境の一時検証データ', author_name: '動作確認用', category: 'その他' });
      assert.equal(response.status, 303);
      created.push(response.headers.get('location'));
    }
    const first = created[0];
    await register();
    assert.ok(!(await (await get(first)).text()).includes('編集する'));
    assert.equal((await get(first + '/edit')).status, 403);
    assert.equal((await post(first + '/edit', { title: '権限外の編集', content: '内容', category: 'その他' })).status, 403);
    assert.equal((await post(first + '/delete', {})).status, 403);
    assert.equal((await post(first + '/status', { status: 'resolved' })).status, 403);
    cookie = accountA.cookie; csrf = accountA.csrf;
    let response = await post(first + '/edit', { title: marker + '更新済み', content: '<script>test</script> 検証内容', category: '授業' });
    assert.equal(response.status, 303);
    let html = await (await get(first)).text();
    assert.ok(html.includes(marker + '更新済み'));
    assert.ok(html.includes('&lt;script&gt;'));
    for (const content of ['検証用回答1', '検証用回答2']) {
      assert.equal((await post(first + '/answers', { author_name: '回答確認用', content })).status, 303);
    }
    const listedIds = html => [...html.matchAll(/data-question-id="(\d+)"/g)].map(match => Number(match[1]));
    const firstId = Number(first.split('/').pop());
    const secondId = Number(created[1].split('/').pop());
    assert.deepEqual(listedIds(await (await get('/questions?q=' + encodeURIComponent(marker) + '&sort=answers')).text()), [firstId, secondId]);
    assert.equal((await post(first + '/status', { status: 'resolved' })).status, 303);
    assert.ok((await (await get(first)).text()).includes('未解決に戻す'));
    assert.deepEqual(listedIds(await (await get('/questions?q=' + encodeURIComponent(marker) + '&status=resolved&category=' + encodeURIComponent('授業') + '&sort=answers')).text()), [firstId]);
    assert.deepEqual(listedIds(await (await get('/questions?q=' + encodeURIComponent(marker) + '&status=unresolved')).text()), [secondId]);
    assert.equal((await post(first + '/status', { status: 'unresolved' })).status, 303);
    assert.ok((await (await get(first)).text()).includes('解決済みにする'));
    assert.equal((await post(first + '/status', { status: 'invalid' })).status, 422);
    html = await (await get(first)).text();
    assert.ok(html.includes('検証用回答1') && html.includes('検証用回答2'));
    assert.ok(!(await (await get(created[1])).text()).includes('検証用回答1'));
    response = await get('/questions?q=' + encodeURIComponent(marker) + '&category=' + encodeURIComponent('授業'));
    html = await response.text();
    assert.ok(html.includes(marker + '更新済み') && !html.includes(marker + 'B'));
    assert.ok((await (await get('/questions?q=' + encodeURIComponent(randomUUID()))).text()).includes('条件に合う質問が見つかりませんでした'));
    const answerPath = html => html.match(/action="(\/questions\/\d+\/answers\/\d+\/delete)"/)?.[1];
    const answer = answerPath(await (await get(first)).text());
    assert.ok(answer);
    assert.equal((await post(answer, {})).status, 303);
    assert.ok(!(await (await get(first)).text()).includes('検証用回答1'));
    const remainingAnswer = answerPath(await (await get(first)).text());
    assert.ok(remainingAnswer);
    cookie = accounts[1].cookie; csrf = accounts[1].csrf;
    assert.ok(!(await (await get(first)).text()).includes('この回答を削除'));
    assert.equal((await post(remainingAnswer, {})).status, 403);
    cookie = accountA.cookie; csrf = accountA.csrf;
    assert.equal((await post('/questions', { title: '', content: '', author_name: '', category: '不正' })).status, 422);
    assert.equal((await post(first + '/delete', {}, { origin: 'https://example.com' })).status, 403);
    assert.equal((await get('/questions/not-an-id')).status, 404);
    assert.equal((await post(first + '/edit', { _csrf: 'invalid' })).status, 403);
    const old = { cookie, csrf };
    assert.equal((await post('/logout', {})).status, 303);
    assert.equal((await post('/questions', {})).status, 401);
    cookie = ''; csrf = '';
    assert.equal((await post('/login', { login_id: accountA.login_id, password: 'wrong' })).status, 422);
    const login = await post('/login', { login_id: accountA.login_id, password: accountA.password });
    assert.equal(login.status, 303); await adopt(login);
    Object.assign(accountA, { cookie, csrf });
    assert.notEqual(cookie, old.cookie);
    assert.equal((await post('/questions', { _csrf: old.csrf }, { cookie: old.cookie })).status, 401);
    console.log('公開環境：基本CRUD・認証・権限制御に加え、状態の双方向変更・複合絞り込み・回答件数順を確認。');
    assert.equal((await post(first + '/delete', {})).status, 303);
    assert.equal((await get(first)).status, 404);
    assert.equal((await post(remainingAnswer, {})).status, 404);
  } finally {
    if (accounts[0]) { cookie = accounts[0].cookie; csrf = accounts[0].csrf; }
    for (const url of created) {
      const response = await post(url + '/delete', {});
      assert.ok([303, 404].includes(response.status));
      assert.equal((await get(url)).status, 404);
    }
    console.log('今回作成した検証用投稿を削除しました。');
    for (const account of accounts) {
      cookie = account.cookie; csrf = account.csrf;
      assert.equal((await post('/account/delete', { password: account.password, confirm: 'delete' })).status, 303);
      assert.equal((await post('/questions', {})).status, 401);
    }
    console.log('今回作成した検証用アカウントとSessionも削除しました。');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

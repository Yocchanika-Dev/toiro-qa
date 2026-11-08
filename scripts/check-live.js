// 公開環境の動作検証。今回作成した検証用投稿だけを最後に削除する。
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const origin = process.env.PUBLIC_BASE_URL;
if (!origin || !origin.startsWith('https://')) throw new Error('PUBLIC_BASE_URLに検証対象のHTTPS URLを指定してください。');
const marker = `動作検証-${randomUUID()}`;
const created = [];
const get = url => fetch(origin + url, { signal: AbortSignal.timeout(20000) });
const post = (url, data, headers = {}) => fetch(origin + url, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual', headers: { origin, ...headers }, signal: AbortSignal.timeout(20000) });
async function main() {
  try {
    assert.equal((await get('/health')).status, 200);
    assert.equal((await get('/style.css')).status, 200);
    assert.equal((await get('/.env')).status, 404);
    assert.equal((await get('/.local/postgres/PG_VERSION')).status, 404);
    for (const suffix of ['A', 'B']) {
      const response = await post('/questions', { title: marker + suffix, content: '公開環境の一時検証データ', author_name: '動作確認用', category: 'その他' });
      assert.equal(response.status, 303);
      created.push(response.headers.get('location'));
    }
    const first = created[0];
    let response = await post(first + '/edit', { title: marker + '更新済み', content: '<script>test</script> 検証内容', category: '授業' });
    assert.equal(response.status, 303);
    let html = await (await get(first)).text();
    assert.ok(html.includes(marker + '更新済み'));
    assert.ok(html.includes('&lt;script&gt;'));
    for (const content of ['検証用回答1', '検証用回答2']) {
      assert.equal((await post(first + '/answers', { author_name: '回答確認用', content })).status, 303);
    }
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
    assert.equal((await post('/questions', { title: '', content: '', author_name: '', category: '不正' })).status, 422);
    assert.equal((await post(first + '/delete', {}, { origin: 'https://example.com' })).status, 403);
    assert.equal((await get('/questions/not-an-id')).status, 404);
    console.log('公開環境：DB接続・CSS・質問CRUD・複数回答・回答削除・検索・入力検証・HTMLエスケープ・秘密ファイル非公開を確認。');
    assert.equal((await post(first + '/delete', {})).status, 303);
    assert.equal((await get(first)).status, 404);
    assert.equal((await post(remainingAnswer, {})).status, 404);
  } finally {
    for (const url of created) {
      const response = await post(url + '/delete', {});
      assert.ok([303, 404].includes(response.status));
      assert.equal((await get(url)).status, 404);
    }
    console.log('今回作成した検証用投稿を削除しました。');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { newDb, DataType } = require('pg-mem');
const { createApp } = require('../app');
const { hashPassword } = require('../auth');
const { clientAddress, keyFor } = require('../rate-limit');
const { databaseUrl } = require('../db/pool');

test('共有頻度制限・ロック妨害防止・ページ分割・Preview分離', async t => {
  let pool;
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    const admin = new Pool({connectionString:process.env.TEST_DATABASE_URL});
    const schema=`qa_security_${Date.now()}_${process.pid}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
    t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
    await pool.query(fs.readFileSync('db/schema.sql','utf8'));
  } else {
    const db=newDb();
    db.public.registerFunction({name:'trim',args:[DataType.text],returns:DataType.text,implementation:s=>s.trim()});
    db.public.registerFunction({name:'length',args:[DataType.text],returns:DataType.integer,implementation:s=>[...s].length});
    db.public.none(fs.readFileSync('db/schema.sql','utf8'));
    const {Pool}=db.adapters.createPg();pool=new Pool();t.after(()=>pool.end());
  }
  const servers=[];
  for(let i=0;i<2;i++) {
    const server=createApp(pool).listen(0,'127.0.0.1');
    await new Promise(r=>server.once('listening',r));servers.push(server);
  }
  t.after(async()=>{for(const server of servers)await new Promise(r=>server.close(r));});
  const base=`http://127.0.0.1:${servers[0].address().port}`;
  const second=`http://127.0.0.1:${servers[1].address().port}`;
  const old=process.env.APP_ORIGIN;process.env.APP_ORIGIN=base;
  t.after(()=>{if(old===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=old;});
  let cookie='',csrf='';
  const post=(route,data={},target=base,extra={})=>fetch(target+route,{method:'POST',redirect:'manual',headers:{origin:base,cookie,...extra},body:new URLSearchParams({_csrf:csrf,...data})});
  const get=route=>fetch(base+route,{headers:{cookie},redirect:'manual'});
  // Two app instances share the counter, and untrusted forwarded headers cannot reset it.
  for(let i=0;i<10;i++)assert.equal((await post('/register',{},i%2?second:base)).status,422);
  const limited=await post('/register',{},second,{'x-forwarded-for':'198.51.100.90','x-vercel-forwarded-for':'198.51.100.91'});
  assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM users')).rows[0].n),0);
  await pool.query('UPDATE auth_attempts SET expires_at=$1',[new Date(0)]);
  assert.equal((await post('/register')).status,422);
  const concurrent=await Promise.all(Array.from({length:12},(_,i)=>post('/register',{},i%2?second:base)));
  assert.equal(concurrent.filter(r=>r.status===422).length,9);
  assert.equal(concurrent.filter(r=>r.status===429).length,3);
  // A different sender's failures must not prevent a valid password from logging in.
  const user=(await pool.query('INSERT INTO users(login_id,display_name,password_hash) VALUES($1,$2,$3) RETURNING id',['security_user','検証用',await hashPassword('Security-test-password-2026!')])).rows[0];
  await pool.query('INSERT INTO auth_attempts(key_hash,attempts,expires_at) VALUES($1,11,$2)',[keyFor('account-failure','security_user'),new Date(Date.now()+900000)]);
  await pool.query('INSERT INTO auth_attempts(key_hash,attempts,expires_at) VALUES($1,11,$2)',[keyFor('login-pair',['198.51.100.1','security_user']),new Date(Date.now()+900000)]);
  const login=await post('/login',{login_id:'security_user',password:'Security-test-password-2026!'});
  assert.equal(login.status,303);
  cookie=login.headers.get('set-cookie').split(';')[0];
  // No questions yet: obtain CSRF from logout form, without a counter reset.
  csrf=(await (await get('/questions')).text()).match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  const ids=[];
  for(let i=0;i<43;i++)ids.push((await pool.query('INSERT INTO questions(title,content,author_name,category,user_id,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[`page-${i}`,'x'.repeat(10000),'検証用',i%2?'授業':'その他',user.id,new Date(1700000000000+i*1000)])).rows[0].id);
  const listed=html=>[...html.matchAll(/data-question-id="(\d+)"/g)].map(m=>Number(m[1]));
  let html=await (await get('/questions')).text();
  assert.deepEqual(listed(html),ids.slice(-20).reverse());assert.ok(html.includes('次の20件'));
  assert.ok(!html.includes('x'.repeat(181)),'DBから取得する本文も180文字に制限');
  assert.deepEqual(listed(await (await get('/questions?page=2')).text()),ids.slice(3,23).reverse());
  assert.deepEqual(listed(await (await get('/questions?page=3')).text()),ids.slice(0,3).reverse());
  assert.equal(listed(await (await get('/questions?page=999999999999999999')).text()).length,20);
  html=await (await get('/questions?q=page-&category='+encodeURIComponent('授業')+'&status=unresolved&sort=answers')).text();
  assert.equal(listed(html).length,20);assert.ok(html.includes('page=2')&&html.includes('status=unresolved')&&html.includes('sort=answers'));
  const q=ids[0],answers=[],notices=[];
  for(let i=0;i<42;i++) {
    const answer=(await pool.query('INSERT INTO answers(question_id,author_name,content,user_id) VALUES($1,$2,$3,$4) RETURNING id',[q,'回答検証',`answer-${i}`,user.id])).rows[0];answers.push(answer.id);
    notices.push((await pool.query('INSERT INTO notifications(recipient_id,answer_id) VALUES($1,$2) RETURNING id',[user.id,answer.id])).rows[0].id);
  }
  const shown=html=>[...html.matchAll(/data-answer-id="(\d+)"/g)].map(m=>Number(m[1]));
  assert.deepEqual(shown(await (await get(`/questions/${q}`)).text()),answers.slice(0,20));
  assert.deepEqual(shown(await (await get(`/questions/${q}?page=2`)).text()),answers.slice(20,40));
  assert.deepEqual(shown(await (await get(`/questions/${q}?page=3`)).text()),answers.slice(40));
  html=await (await get('/notifications')).text();
  assert.equal((html.match(/data-notification-id=/g)||[]).length,20);assert.ok(html.includes('次の20件'));
  html=await (await get('/notifications?page=3')).text();assert.equal((html.match(/data-notification-id=/g)||[]).length,2);
  assert.equal((await post(`/notifications/${notices[41]}/open`)).headers.get('location'),`/questions/${q}?page=3#answer-${answers[41]}`);
  assert.equal((await post(`/questions/${q}/answers/${answers[22]}/like`,{action:'add'})).headers.get('location'),`/questions/${q}?page=2#answer-${answers[22]}`);
  assert.equal((await post(`/questions/${q}/best-answer`,{answer_id:answers[22]})).headers.get('location'),`/questions/${q}?page=2#answer-${answers[22]}`);
  assert.equal((await post(`/questions/${q}/answers`,{content:'新しい回答'})).headers.get('location'),`/questions/${q}?page=3#answer-${answers[41]+1}`);
  for(let i=0;i<10;i++)assert.equal((await post('/questions',{title:'頻度検証',content:'内容',category:'授業'})).status,303);
  assert.equal((await post('/questions',{title:'制限される質問',content:'内容',category:'授業'})).status,429);
  assert.equal(Number((await pool.query("SELECT count(*) AS n FROM questions WHERE title='制限される質問'")).rows[0].n),0);
  const previousVercel=process.env.VERCEL;
  try{
    delete process.env.VERCEL;
    assert.equal(clientAddress({socket:{remoteAddress:'127.0.0.1'},get:()=> '198.51.100.2'}),'127.0.0.1');
    process.env.VERCEL='1';
    assert.equal(clientAddress({get:()=> '2001:db8:abcd:1234:1::1'}),clientAddress({get:()=> '2001:db8:abcd:1234:2::2'}));
    assert.equal(clientAddress({get:()=> 'not-an-ip'}),'unknown');
  } finally{if(previousVercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=previousVercel;}
  assert.throws(()=>databaseUrl({VERCEL_ENV:'preview',DATABASE_URL:'production-only'}),/PREVIEW_DATABASE_URL/);
  assert.equal(databaseUrl({VERCEL_ENV:'preview',DATABASE_URL:'production-only',PREVIEW_DATABASE_URL:'isolated-preview'}),'isolated-preview');
  assert.equal(databaseUrl({VERCEL_ENV:'production',DATABASE_URL:'production-only'}),'production-only');
});

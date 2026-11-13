const express = require('express');
const path = require('node:path');
const { installAuth, requireUser } = require('./auth');
const { createRateLimiter, clientAddress } = require('./rate-limit');
const { PAGE_SIZE, pageNumber, pagination } = require('./pagination');
const categories = ['授業', '課外活動', 'その他'];
const validId = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647;
const text = value => typeof value === 'string' ? value.trim() : '';

function createApp(pool) {
  const app = express();
  const limiter = createRateLimiter(pool);
  app.disable('x-powered-by');
  app.locals.currentUser = null;
  app.locals.csrfToken = '';
  app.locals.unreadCount = 0;
  app.locals.categories = categories;
  app.locals.currentPath = '';
  app.locals.navCategory = '';
  app.locals.navStatus = '';
  app.locals.navSort = '';
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use((req, res, next) => {
    req.body ||= {};
    res.locals.currentPath = req.path;
    res.locals.navCategory = text(req.query.category);
    res.locals.navStatus = text(req.query.status);
    res.locals.navSort = text(req.query.sort);
    res.locals.currentUser = null;
    res.locals.csrfToken = '';
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    // ブラウザから別サイト経由で送られた変更リクエストを拒否。
    if (req.method === 'POST') {
      const origin = req.get('origin');
      const expected = process.env.APP_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `${req.protocol}://${req.get('host')}`);
      if (req.get('sec-fetch-site') === 'cross-site' || origin !== expected) {
        return res.status(403).render('error', { title: '送信できません', message: 'このサイトのフォームから送信してください。' });
      }
    }
    res.locals.categories = categories;
    res.locals.date = value => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    next();
  });
  installAuth(app, pool, limiter);
  app.use(async (req,res,next) => {
    if (req.method === 'POST') {
      if (!await limiter.enforce(req,res,'write-source',clientAddress(req),120,60)) return;
      if (req.user && !await limiter.enforce(req,res,'write-user',req.user.id,90,60)) return;
      const scope = req.path === '/questions' ? 'new-question' : /^\/questions\/\d+\/answers$/.test(req.path) ? 'new-answer' : '';
      if (scope && req.user && !await limiter.enforce(req,res,scope,req.user.id,scope === 'new-question' ? 10 : 30,600)) return;
    }
    if (req.method === 'GET' && (req.path === '/questions' || req.path === '/notifications' || /^\/questions\/\d+$/.test(req.path))) {
      if (!await limiter.enforce(req,res,'read-source',clientAddress(req),180,60)) return;
    }
    next();
  });

  app.get('/', (req, res) => res.redirect('/questions'));
  app.get('/guide', (req, res) => res.render('guide', { title: 'この場所の使い方' }));
  app.get('/health', async (req, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok' }); });
  app.get('/notifications', requireUser, async (req, res) => {
    const filter = req.query.filter === 'unread' ? 'unread' : 'all';
    const page = pageNumber(req.query.page);
    const { rows } = await pool.query(`SELECT n.id,n.is_read,n.created_at,a.author_name,substring(a.content from 1 for 160) AS content,a.id AS answer_id,q.id AS question_id,q.title
      FROM notifications n JOIN answers a ON a.id=n.answer_id JOIN questions q ON q.id=a.question_id
      WHERE n.recipient_id=$1 AND q.user_id=$1 ${filter === 'unread' ? 'AND n.is_read=FALSE' : ''}
      ORDER BY n.created_at DESC,n.id DESC LIMIT $2 OFFSET $3`, [req.user.id,PAGE_SIZE+1,(page-1)*PAGE_SIZE]);
    if (page > 1 && !rows.length) return res.redirect(303, '/notifications?' + new URLSearchParams({filter}).toString());
    res.render('notifications', { title: '通知', notifications: rows.slice(0,PAGE_SIZE), filter, pager: pagination('/notifications',{filter},page,rows.length>PAGE_SIZE) });
  });
  app.post('/notifications/read-all', requireUser, async (req, res) => {
    await pool.query('UPDATE notifications SET is_read=TRUE WHERE recipient_id=$1 AND is_read=FALSE', [req.user.id]);
    res.redirect(303, '/notifications');
  });
  app.post('/notifications/:id/read', requireUser, async (req, res) => {
    if (!validId(req.params.id) || !['read', 'unread'].includes(req.body.state)) return res.status(422).render('error', { title: '通知を変更できません', message: '通知一覧から操作してください。' });
    const result = await pool.query('UPDATE notifications SET is_read=$1 WHERE id=$2 AND recipient_id=$3 RETURNING id', [req.body.state === 'read', req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).render('error', { title: '通知が見つかりません', message: '自分宛ての通知を選んでください。' });
    res.redirect(303, '/notifications');
  });
  app.post('/notifications/:id/open', requireUser, async (req, res) => {
    if (!validId(req.params.id)) return missing(res);
    const notice = (await pool.query('SELECT n.answer_id,a.question_id FROM notifications n JOIN answers a ON a.id=n.answer_id WHERE n.id=$1 AND n.recipient_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!notice) return res.status(404).render('error', { title: '通知が見つかりません', message: '自分宛ての通知を選んでください。' });
    await pool.query('UPDATE notifications SET is_read=TRUE WHERE id=$1 AND recipient_id=$2', [req.params.id, req.user.id]);
    res.redirect(303, await answerLocation(notice.question_id,notice.answer_id));
  });
  app.get('/questions', async (req, res) => {
    const page = pageNumber(req.query.page);
    const keyword = text(req.query.q).slice(0, 150);
    const category = text(req.query.category);
    const status = ['unresolved', 'resolved'].includes(req.query.status) ? req.query.status : '';
    const sort = req.query.sort === 'answers' ? 'answers' : 'newest';
    const values = [];
    const where = [];
    if (keyword) {
      // LIKEの記号をエスケープし、入力を文字列として検索。
      values.push(`%${keyword.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`(q.title ILIKE $${values.length} OR q.content ILIKE $${values.length})`);
    }
    if (categories.includes(category)) { values.push(category); where.push(`q.category = $${values.length}`); }
    if (status) { values.push(status); where.push(`q.status = $${values.length}`); }
    // 並べ替え条件は固定SQLから選ぶ。リクエスト文字列はSQLへ連結しない。
    const order = sort === 'answers' ? 'answer_count DESC, q.created_at DESC, q.id DESC' : 'q.created_at DESC, q.id DESC';
    const limits = [...values, PAGE_SIZE+1, (page-1)*PAGE_SIZE];
    const { rows } = await pool.query(`SELECT q.id,q.title,substring(q.content from 1 for 180) AS content,q.author_name,q.category,q.status,q.created_at, COALESCE(a.answer_count, 0) AS answer_count FROM questions q LEFT JOIN (SELECT question_id, count(*) AS answer_count FROM answers GROUP BY question_id) a ON a.question_id=q.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT $${values.length+1} OFFSET $${values.length+2}`, limits);
    if (page > 1 && !rows.length) return res.redirect(303, pagination('/questions',{q:keyword,category,status,sort},2,false).previous);
    res.render('index', { title: '質問一覧', questions: rows.slice(0,PAGE_SIZE), keyword, category, status, sort, pager: pagination('/questions',{q:keyword,category,status,sort},page,rows.length>PAGE_SIZE) });
  });
  app.get('/questions/new', requireUser, (req, res) => res.render('form', { title: '質問する', question: {}, errors: [], editing: false }));

  function validate(body, question = true) {
    const data = { author_name: text(body.author_name), content: text(body.content) };
    const errors = [];
    if (!data.author_name || data.author_name.length > 50) errors.push('名前は1〜50文字で入力してください。');
    if (!data.content || data.content.length > 10000) errors.push('内容は1〜10,000文字で入力してください。');
    if (question) {
      data.title = text(body.title); data.category = text(body.category);
      if (!data.title || data.title.length > 150) errors.push('タイトルは1〜150文字で入力してください。');
      if (!categories.includes(data.category)) errors.push('カテゴリを選択してください。');
    }
    return { data, errors };
  }
  async function getQuestion(id) {
    if (!validId(id)) return null;
    return (await pool.query('SELECT * FROM questions WHERE id=$1', [id])).rows[0];
  }
  async function getAnswers(questionId, userId, page = 1) {
    const { rows } = await pool.query(`SELECT a.*, (b.answer_id IS NOT NULL) AS is_best
      FROM answers a LEFT JOIN best_answers b ON b.question_id=a.question_id AND b.answer_id=a.id
      WHERE a.question_id=$1 ORDER BY a.id LIMIT $2 OFFSET $3`, [questionId, PAGE_SIZE+1, (page-1)*PAGE_SIZE]);
    if (!rows.length) return rows;
    const ids = rows.map(row => row.id);
    const placeholders = ids.map((_,index) => '$'+(index+1)).join(',');
    const [counts, mine] = await Promise.all([
      pool.query(`SELECT answer_id,count(*) AS like_count FROM answer_likes WHERE answer_id IN (${placeholders}) GROUP BY answer_id`, ids),
      pool.query(`SELECT answer_id FROM answer_likes WHERE answer_id IN (${placeholders}) AND user_id=$${ids.length+1}`, [...ids,userId || 0])
    ]);
    const countById = new Map(counts.rows.map(row => [row.answer_id,Number(row.like_count)]));
    const liked = new Set(mine.rows.map(row => row.answer_id));
    return rows.map(row => ({...row,like_count:countById.get(row.id) || 0,liked_by_me:liked.has(row.id)}));
  }
  async function answerLocation(questionId,answerId) {
    const position = Number((await pool.query('SELECT count(*) AS position FROM answers WHERE question_id=$1 AND id<=$2', [questionId,answerId])).rows[0].position);
    const page = Math.max(1,Math.ceil(position/PAGE_SIZE));
    return `/questions/${questionId}${page > 1 ? '?page='+page : ''}#answer-${answerId}`;
  }
  function answersPage(questionId,value) {
    const page = pageNumber(value);
    return `/questions/${questionId}${page > 1 ? '?page='+page : ''}#answers`;
  }
  function missing(res) { return res.status(404).render('error', { title: '質問が見つかりません', message: '質問は削除されたか、URLが間違っています。' }); }
  function forbidden(res) { return res.status(403).render('error', { title: '操作できません', message: '自分の投稿だけを編集・削除できます。' }); }

  // Create：フォーム値を検証し、プレースホルダーでDBへ保存する。
  app.post('/questions', requireUser, async (req, res) => {
    const { data, errors } = validate({ ...req.body, author_name: req.user.display_name });
    if (errors.length) return res.status(422).render('form', { title: '質問する', question: data, errors, editing: false });
    const { rows } = await pool.query('INSERT INTO questions (title, content, author_name, category, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [data.title, data.content, data.author_name, data.category, req.user.id]);
    res.redirect(303, `/questions/${rows[0].id}`);
  });
  app.get('/questions/:id', async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    const page = pageNumber(req.query.page);
    const answers = await getAnswers(question.id, req.user?.id, page);
    if (page > 1 && !answers.length) return res.redirect(303, `/questions/${question.id}#answers`);
    res.render('detail', { title: question.title, question, answers: answers.slice(0,PAGE_SIZE), errors: [], answer: {}, pager: pagination(`/questions/${question.id}`,{},page,answers.length>PAGE_SIZE,'#answers') });
  });
  app.get('/questions/:id/edit', requireUser, async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    if (question.user_id !== req.user.id) return forbidden(res);
    res.render('form', { title: '質問を編集', question, errors: [], editing: true });
  });
  // 解決状態は質問者本人だけが変更できる。新規質問の初期値はDBで未解決。
  app.post('/questions/:id/status', requireUser, async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    if (question.user_id !== req.user.id) return forbidden(res);
    if (!['unresolved', 'resolved'].includes(req.body.status)) return res.status(422).render('error', { title: '状態を変更できません', message: '未解決または解決済みを選択してください。' });
    const result = await pool.query('UPDATE questions SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND user_id=$3 RETURNING id', [req.body.status, question.id, req.user.id]);
    if (!result.rows.length) return missing(res);
    res.redirect(303, `/questions/${question.id}`);
  });
  app.post('/questions/:id/best-answer', requireUser, async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    if (question.user_id !== req.user.id) return forbidden(res);
    if (req.body.answer_id === '') {
      await pool.query('DELETE FROM best_answers WHERE question_id=$1', [question.id]);
    } else {
      if (typeof req.body.answer_id !== 'string' || !validId(req.body.answer_id)) return res.status(422).render('error', { title: '回答を選択できません', message: 'この質問への回答を選択してください。' });
      const answer = (await pool.query('SELECT id FROM answers WHERE id=$1 AND question_id=$2', [req.body.answer_id, question.id])).rows[0];
      if (!answer) return res.status(404).render('error', { title: '回答が見つかりません', message: 'この質問への回答を選択してください。' });
      try {
        await pool.query('INSERT INTO best_answers(question_id,answer_id) VALUES ($1,$2) ON CONFLICT(question_id) DO UPDATE SET answer_id=EXCLUDED.answer_id', [question.id, answer.id]);
      } catch (error) {
        // 選択と同時に質問や回答が削除された場合も整合性を保つ。
        if (error.code === '23503') return missing(res);
        throw error;
      }
    }
    res.redirect(303, req.body.answer_id ? await answerLocation(question.id,req.body.answer_id) : answersPage(question.id,req.body.page));
  });
  // Update：URLのIDで対象を特定。投稿者名は元の値を保持する。
  app.post('/questions/:id/edit', requireUser, async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    if (question.user_id !== req.user.id) return forbidden(res);
    const { data, errors } = validate({ ...req.body, author_name: question.author_name });
    if (errors.length) return res.status(422).render('form', { title: '質問を編集', question: { ...question, ...data }, errors, editing: true });
    const result = await pool.query('UPDATE questions SET title=$1, content=$2, category=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 AND user_id=$5 RETURNING id', [data.title, data.content, data.category, question.id, req.user.id]);
    if (!result.rows.length) return missing(res);
    res.redirect(303, `/questions/${question.id}`);
  });
  app.get('/questions/:id/delete', requireUser, async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    if (question.user_id !== req.user.id) return forbidden(res);
    res.render('delete', { title: '質問の削除', question });
  });
  // Delete：外部キーのON DELETE CASCADEで関連回答も同時に削除される。
  app.post('/questions/:id/delete', requireUser, async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    if (question.user_id !== req.user.id) return forbidden(res);
    const result = await pool.query('DELETE FROM questions WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.id]);
    if (!result.rows.length) return missing(res);
    res.redirect(303, '/questions');
  });
  app.post('/questions/:id/answers', requireUser, async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    const { data, errors } = validate({ ...req.body, author_name: req.user.display_name }, false);
    if (errors.length) {
      const answers = await getAnswers(question.id, req.user?.id);
      return res.status(422).render('detail', { title: question.title, question, answers: answers.slice(0,PAGE_SIZE), errors, answer: data, pager: pagination(`/questions/${question.id}`,{},1,answers.length>PAGE_SIZE,'#answers') });
    }
    // 回答と質問者への通知を同一トランザクションで保存し、片方だけの保存を防ぐ。
    let postedAnswerId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const answer = (await client.query('INSERT INTO answers (question_id, author_name, content, user_id) VALUES ($1,$2,$3,$4) RETURNING id', [question.id, data.author_name, data.content, req.user.id])).rows[0];
      postedAnswerId = answer.id;
      // 自分自身の回答と、所有者のいない旧投稿には通知しない。
      await client.query('INSERT INTO notifications(recipient_id,answer_id) SELECT user_id,$1::integer FROM questions WHERE id=$2 AND user_id IS NOT NULL AND user_id<>$3', [answer.id, question.id, req.user.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23503') return missing(res);
      throw error;
    } finally { client.release(); }
    res.redirect(303, await answerLocation(question.id,postedAnswerId));
  });
  app.post('/questions/:id/answers/:answerId/like', requireUser, async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.answerId)) return missing(res);
    if (!['add', 'remove'].includes(req.body.action)) return res.status(422).render('error', { title: '操作できません', message: '回答のいいねボタンから操作してください。' });
    const answer = (await pool.query('SELECT id FROM answers WHERE id=$1 AND question_id=$2', [req.params.answerId, req.params.id])).rows[0];
    if (!answer) return res.status(404).render('error', { title: '回答が見つかりません', message: 'この質問への回答を選択してください。' });
    try {
      if (req.body.action === 'add') {
        // 再送・同時送信でも1ユーザー1件。クライアントのuser_idは使用しない。
        await pool.query('INSERT INTO answer_likes(answer_id,user_id) VALUES ($1,$2) ON CONFLICT(answer_id,user_id) DO NOTHING', [answer.id, req.user.id]);
      } else {
        await pool.query('DELETE FROM answer_likes WHERE answer_id=$1 AND user_id=$2', [answer.id, req.user.id]);
      }
    } catch (error) {
      if (error.code === '23503') return missing(res);
      throw error;
    }
    res.redirect(303, await answerLocation(req.params.id,answer.id));
  });
  app.post('/questions/:id/answers/:answerId/delete', requireUser, async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.answerId)) return missing(res);
    const answer = (await pool.query('SELECT user_id FROM answers WHERE id=$1 AND question_id=$2', [req.params.answerId, req.params.id])).rows[0];
    if (answer && answer.user_id !== req.user.id) return forbidden(res);
    const result = await pool.query('DELETE FROM answers WHERE id=$1 AND question_id=$2 AND user_id=$3 RETURNING id', [req.params.answerId, req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).render('error', { title: '回答が見つかりません', message: '削除対象の回答がありません。' });
    res.redirect(303, answersPage(req.params.id,req.body.page));
  });
  app.use((req, res) => res.status(404).render('error', { title: 'ページが見つかりません', message: 'URLを確認してください。' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('Request failed:', error.code || error.name);
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).render('error', { title: '処理できませんでした', message: status === 500 ? '時間をおいて再度お試しください。' : '送信内容を確認してください。' });
  });
  return app;
}
module.exports = { createApp };

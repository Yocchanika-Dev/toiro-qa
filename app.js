const express = require('express');
const path = require('node:path');
const categories = ['授業', '課外活動', 'その他'];
const validId = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647;
const text = value => typeof value === 'string' ? value.trim() : '';

function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    // ブラウザから別サイト経由で送られた変更リクエストを拒否。
    if (req.method === 'POST') {
      const origin = req.get('origin');
      const expected = process.env.APP_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `${req.protocol}://${req.get('host')}`);
      if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected)) {
        return res.status(403).render('error', { title: '送信できません', message: 'このサイトのフォームから送信してください。' });
      }
    }
    res.locals.categories = categories;
    res.locals.date = value => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    next();
  });

  app.get('/', (req, res) => res.redirect('/questions'));
  app.get('/health', async (req, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok' }); });
  app.get('/questions', async (req, res) => {
    const keyword = text(req.query.q).slice(0, 150);
    const category = text(req.query.category);
    const values = [];
    const where = [];
    if (keyword) {
      // LIKEの記号をエスケープし、入力を文字列として検索。
      values.push(`%${keyword.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`(q.title ILIKE $${values.length} OR q.content ILIKE $${values.length})`);
    }
    if (categories.includes(category)) { values.push(category); where.push(`q.category = $${values.length}`); }
    const { rows } = await pool.query(`SELECT q.*, COALESCE(a.answer_count, 0) AS answer_count FROM questions q LEFT JOIN (SELECT question_id, count(*) AS answer_count FROM answers GROUP BY question_id) a ON a.question_id=q.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY q.created_at DESC, q.id DESC`, values);
    res.render('index', { title: '質問一覧', questions: rows, keyword, category });
  });
  app.get('/questions/new', (req, res) => res.render('form', { title: '質問する', question: {}, errors: [], editing: false }));

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
  function missing(res) { return res.status(404).render('error', { title: '質問が見つかりません', message: '質問は削除されたか、URLが間違っています。' }); }

  // Create：フォーム値を検証し、プレースホルダーでDBへ保存する。
  app.post('/questions', async (req, res) => {
    const { data, errors } = validate(req.body);
    if (errors.length) return res.status(422).render('form', { title: '質問する', question: data, errors, editing: false });
    const { rows } = await pool.query('INSERT INTO questions (title, content, author_name, category) VALUES ($1,$2,$3,$4) RETURNING id', [data.title, data.content, data.author_name, data.category]);
    res.redirect(303, `/questions/${rows[0].id}`);
  });
  app.get('/questions/:id', async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    const { rows } = await pool.query('SELECT * FROM answers WHERE question_id=$1 ORDER BY created_at, id', [question.id]);
    res.render('detail', { title: question.title, question, answers: rows, errors: [], answer: {} });
  });
  app.get('/questions/:id/edit', async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    res.render('form', { title: '質問を編集', question, errors: [], editing: true });
  });
  // Update：URLのIDで対象を特定。投稿者名は元の値を保持する。
  app.post('/questions/:id/edit', async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    const { data, errors } = validate({ ...req.body, author_name: question.author_name });
    if (errors.length) return res.status(422).render('form', { title: '質問を編集', question: { ...question, ...data }, errors, editing: true });
    const result = await pool.query('UPDATE questions SET title=$1, content=$2, category=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING id', [data.title, data.content, data.category, question.id]);
    if (!result.rows.length) return missing(res);
    res.redirect(303, `/questions/${question.id}`);
  });
  app.get('/questions/:id/delete', async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    res.render('delete', { title: '質問の削除', question });
  });
  // Delete：外部キーのON DELETE CASCADEで関連回答も同時に削除される。
  app.post('/questions/:id/delete', async (req, res) => {
    if (!validId(req.params.id)) return missing(res);
    const result = await pool.query('DELETE FROM questions WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return missing(res);
    res.redirect(303, '/questions');
  });
  app.post('/questions/:id/answers', async (req, res) => {
    const question = await getQuestion(req.params.id);
    if (!question) return missing(res);
    const { data, errors } = validate(req.body, false);
    if (errors.length) {
      const { rows } = await pool.query('SELECT * FROM answers WHERE question_id=$1 ORDER BY created_at, id', [question.id]);
      return res.status(422).render('detail', { title: question.title, question, answers: rows, errors, answer: data });
    }
    await pool.query('INSERT INTO answers (question_id, author_name, content) VALUES ($1,$2,$3)', [question.id, data.author_name, data.content]);
    res.redirect(303, `/questions/${question.id}#answers`);
  });
  app.post('/questions/:id/answers/:answerId/delete', async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.answerId)) return missing(res);
    const result = await pool.query('DELETE FROM answers WHERE id=$1 AND question_id=$2 RETURNING id', [req.params.answerId, req.params.id]);
    if (!result.rows.length) return res.status(404).render('error', { title: '回答が見つかりません', message: '削除対象の回答がありません。' });
    res.redirect(303, `/questions/${req.params.id}#answers`);
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

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const cookieName = () => process.env.VERCEL || process.env.NODE_ENV === 'production' ? '__Host-toiro_session' : 'toiro_session';
const cookieOptions = () => ({ httpOnly: true, secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
function tokenFrom(req) {
  const cookies = (req.get('cookie') || '').split(';').map(value => value.trim());
  const raw = cookies.find(value => value.startsWith(cookieName() + '='))?.slice(cookieName().length + 1);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, options);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [type, salt, encoded] = (stored || '').split('$');
  if (type !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(encoded)) return false;
  const key = await scrypt(password, salt, 64, options);
  return crypto.timingSafeEqual(key, Buffer.from(encoded, 'hex'));
}
function installAuth(app, pool) {
  // 生のSession IDはCookieだけに置き、DBにはそのハッシュを保存する。
  app.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.locals.currentUser = null;
    res.locals.csrfToken = '';
    res.locals.unreadCount = 0;
    const token = tokenFrom(req);
    if (token) {
      const { rows } = await pool.query('SELECT u.id, u.display_name FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > CURRENT_TIMESTAMP::timestamptz', [digest(token)]);
      if (rows[0]) {
        req.user = rows[0]; res.locals.currentUser = req.user; res.locals.csrfToken = digest('csrf:' + token);
        res.locals.unreadCount = Number((await pool.query('SELECT count(*) AS unread_count FROM notifications WHERE recipient_id=$1 AND is_read=FALSE', [req.user.id])).rows[0].unread_count);
      }
      else res.clearCookie(cookieName(), cookieOptions());
    }
    if (req.method === 'POST' && req.user && req.body._csrf !== res.locals.csrfToken) {
      return res.status(403).render('error', { title: '送信できません', message: 'ページを再読み込みして、もう一度送信してください。' });
    }
    next();
  });
  const authPage = (res, mode, errors = [], values = {}, status = 200) => res.status(status).render('auth', { title: mode === 'register' ? 'アカウント登録' : 'ログイン', mode, errors, values });
  async function signIn(req, res, userId) {
    const old = tokenFrom(req);
    if (old) await pool.query('DELETE FROM user_sessions WHERE token_hash=$1', [digest(old)]);
    await pool.query('DELETE FROM user_sessions WHERE expires_at <= CURRENT_TIMESTAMP::timestamptz');
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO user_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [digest(token), userId, new Date(Date.now() + 7 * 86400000)]);
    res.cookie(cookieName(), token, { ...cookieOptions(), maxAge: 7 * 86400000 });
    res.redirect(303, '/questions');
  }
  app.get('/register', (req, res) => req.user ? res.redirect('/questions') : authPage(res, 'register'));
  app.get('/login', (req, res) => req.user ? res.redirect('/questions') : authPage(res, 'login'));
  app.post('/register', async (req, res) => {
    const loginId = typeof req.body.login_id === 'string' ? req.body.login_id.trim().toLowerCase() : '';
    const nickname = typeof req.body.display_name === 'string' ? req.body.display_name.trim() : '';
    const password = req.body.password;
    const errors = [];
    if (!/^[a-z0-9_]{4,32}$/.test(loginId)) errors.push('ログインIDは半角英小文字・数字・_の4〜32文字にしてください。');
    if (!nickname || nickname.length > 50) errors.push('ニックネームは1〜50文字にしてください。');
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) errors.push('パスワードは12〜128文字にしてください。');
    if (password !== req.body.password_confirm) errors.push('パスワードが一致しません。');
    const values = { login_id: loginId, display_name: nickname };
    if (errors.length) return authPage(res, 'register', errors, values, 422);
    let user;
    try {
      const hash = await hashPassword(password);
      user = (await pool.query('INSERT INTO users (login_id,display_name,password_hash) VALUES ($1,$2,$3) RETURNING id', [loginId, nickname, hash])).rows[0];
    } catch (error) {
      if (error.code === '23505') return authPage(res, 'register', ['このログインIDは使用できません。別のIDを選んでください。'], values, 422);
      throw error;
    }
    await signIn(req, res, user.id);
  });
  let dummyHash;
  app.post('/login', async (req, res) => {
    const loginId = typeof req.body.login_id === 'string' ? req.body.login_id.trim().toLowerCase().slice(0, 32) : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const key = digest('login:' + loginId);
    await pool.query('DELETE FROM auth_attempts WHERE expires_at <= CURRENT_TIMESTAMP::timestamptz');
    // アカウント単位の試行回数をDBで共有し、複数のサーバーでも制限を維持する。
    const until = new Date(Date.now() + 15 * 60000);
    const { rows: attempts } = await pool.query(`INSERT INTO auth_attempts (key_hash,attempts,expires_at) VALUES ($1,1,$2)
      ON CONFLICT (key_hash) DO UPDATE SET attempts=CASE WHEN auth_attempts.expires_at <= CURRENT_TIMESTAMP::timestamptz THEN 1 ELSE auth_attempts.attempts+1 END,
      expires_at=CASE WHEN auth_attempts.expires_at <= CURRENT_TIMESTAMP::timestamptz THEN EXCLUDED.expires_at ELSE auth_attempts.expires_at END RETURNING attempts`, [key, until]);
    if (attempts[0].attempts > 10) { res.set('Retry-After', '900'); return authPage(res, 'login', ['試行回数が多すぎます。15分後にお試しください。'], { login_id: loginId }, 429); }
    const user = (await pool.query('SELECT id,password_hash FROM users WHERE login_id=$1', [loginId])).rows[0];
    if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(32).toString('hex'));
    const valid = await verifyPassword(password, user?.password_hash || await dummyHash);
    if (!valid || !user) return authPage(res, 'login', ['ログインIDまたはパスワードが違います。'], { login_id: loginId }, 422);
    await pool.query('DELETE FROM auth_attempts WHERE key_hash=$1', [key]);
    await signIn(req, res, user.id);
  });
  app.post('/logout', async (req, res) => {
    const token = tokenFrom(req);
    if (token) await pool.query('DELETE FROM user_sessions WHERE token_hash=$1', [digest(token)]);
    res.clearCookie(cookieName(), cookieOptions());
    res.redirect(303, '/questions');
  });
  app.get('/account', requireUser, (req, res) => res.render('account', { title: 'アカウント', errors: [] }));
  app.post('/account/delete', requireUser, async (req, res) => {
    const user = (await pool.query('SELECT password_hash,login_id FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (req.body.confirm !== 'delete' || !await verifyPassword(req.body.password, user.password_hash)) {
      return res.status(422).render('account', { title: 'アカウント', errors: ['確認欄と現在のパスワードを確認してください。'] });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM questions WHERE user_id=$1', [req.user.id]);
      await client.query('DELETE FROM answers WHERE user_id=$1', [req.user.id]);
      await client.query('DELETE FROM users WHERE id=$1', [req.user.id]);
      await client.query('DELETE FROM auth_attempts WHERE key_hash=$1', [digest('login:' + user.login_id)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    res.clearCookie(cookieName(), cookieOptions());
    res.redirect(303, '/questions');
  });
}
function requireUser(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') return res.redirect(303, '/login');
  return res.status(401).render('error', { title: 'ログインが必要です', message: 'ログインしてから操作してください。' });
}
module.exports = { installAuth, requireUser, hashPassword, verifyPassword };

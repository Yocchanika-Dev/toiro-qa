const { createHash } = require('node:crypto');
const { isIP } = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');

// Only Vercel's overwritten header is trusted on Vercel. Local servers use the socket.
function clientAddress(req) {
  const address = process.env.VERCEL ? req.get('x-vercel-forwarded-for') : req.socket.remoteAddress;
  const raw = typeof address === 'string' ? address.trim() : '';
  if (!isIP(raw)) return 'unknown'; // Missing/invalid headers share one bucket, never bypass it.
  if (raw.startsWith('::ffff:') && isIP(raw.slice(7)) === 4) return raw.slice(7);
  if (isIP(raw) === 6) {
    // Canonicalize IPv6 and group temporary addresses within the same /64 network.
    const expanded = new URL(`http://[${raw}]/`).hostname.slice(1, -1);
    const [left, right = ''] = expanded.split('::');
    const a = left ? left.split(':') : [], b = right ? right.split(':') : [];
    const parts = expanded.includes('::') ? [...a, ...Array(8-a.length-b.length).fill('0'), ...b] : a;
    return parts.slice(0, 4).map(part => parseInt(part, 16).toString(16)).join(':') + '::/64';
  }
  return raw;
}
const keyFor = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
function createRateLimiter(pool) {
  async function consume(key, limit, seconds) {
    await pool.query('DELETE FROM auth_attempts WHERE expires_at <= CURRENT_TIMESTAMP::timestamptz');
    const { rows } = await pool.query(`INSERT INTO auth_attempts(key_hash,attempts,expires_at) VALUES($1,1,$2)
      ON CONFLICT(key_hash) DO UPDATE SET
      attempts=CASE WHEN auth_attempts.expires_at <= CURRENT_TIMESTAMP::timestamptz THEN 1 WHEN auth_attempts.attempts < $3 THEN auth_attempts.attempts+1 ELSE auth_attempts.attempts END,
      expires_at=CASE WHEN auth_attempts.expires_at <= CURRENT_TIMESTAMP::timestamptz THEN EXCLUDED.expires_at ELSE auth_attempts.expires_at END
      RETURNING attempts,expires_at`, [key, new Date(Date.now()+seconds*1000), limit+1]);
    return { allowed: rows[0].attempts <= limit, retryAfter: Math.max(1, Math.ceil((new Date(rows[0].expires_at)-Date.now())/1000)) };
  }
  async function enforce(req, res, scope, identity, limit, seconds) {
    const result = await consume(keyFor(scope, identity), limit, seconds);
    if (result.allowed) return true;
    res.set('Retry-After', String(result.retryAfter));
    res.status(429).render('error', { title: '少し時間をおいてください', message: `操作が続いています。約${Math.ceil(result.retryAfter/60)}分後にもう一度お試しください。この操作は実行されていません。` });
    return false;
  }
  // Account-wide failures slow down invalid attempts but never lock out a correct password.
  async function failedLogin(loginId) {
    const result = await consume(keyFor('account-failure', loginId), 10, 900);
    if (!result.allowed) await delay(1000);
    return result;
  }
  const clear = (...parts) => pool.query('DELETE FROM auth_attempts WHERE key_hash=$1', [keyFor(...parts)]);
  return { enforce, failedLogin, clear };
}
module.exports = { createRateLimiter, clientAddress, keyFor };

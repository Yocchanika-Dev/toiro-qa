const { Pool } = require('pg');

function databaseUrl(env = process.env) {
  // Preview must never silently fall back to the production connection.
  const name = env.VERCEL_ENV === 'preview' ? 'PREVIEW_DATABASE_URL' : 'DATABASE_URL';
  if (!env[name]) throw new Error(`${name}を設定してください。`);
  return env[name];
}
function createPool() {
  return new Pool({ connectionString: databaseUrl(), max: 5, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, statement_timeout: 10000, query_timeout: 12000 });
}
module.exports = { createPool, databaseUrl };

const { createApp } = require('./app');
const { createPool } = require('./db/pool');

async function main() {
  const pool = createPool();
  try { await pool.query('SELECT 1'); }
  catch { await pool.end(); throw new Error('PostgreSQLに接続できません。DATABASE_URLを確認してください。'); }
  const server = createApp(pool).listen(process.env.PORT || 3000, () => {
    console.log(`http://localhost:${process.env.PORT || 3000}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    server.close(async () => { await pool.end(); process.exit(0); });
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

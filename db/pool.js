const { Pool } = require('pg');

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URLを.envに設定してください。');
  return new Pool({ connectionString: process.env.DATABASE_URL });
}
module.exports = { createPool };

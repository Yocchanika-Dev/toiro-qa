const { spawnSync } = require('node:child_process');
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URLを設定してください。');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', 'test/app.test.js', 'test/security.test.js'], { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: process.env.DATABASE_URL } });
  process.exitCode = result.status ?? 1;
}

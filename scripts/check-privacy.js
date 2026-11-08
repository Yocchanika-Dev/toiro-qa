const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = /(^|\/)(\.env(?:\..*)?|\.local|\.vercel|node_modules|\.DS_Store)(\/|$)|\.(pem|key|dump|backup|log)$/;
const username = path.basename(os.homedir());
const secrets = fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').filter(line => /^(DATABASE_URL|.*TOKEN|.*SECRET|.*PASSWORD)=/.test(line)).map(line => line.slice(line.indexOf('=') + 1)).filter(value => value.length > 10) : [];
const failures = [];
for (const file of files) {
  if (file !== '.env.example' && forbidden.test(file)) { failures.push(`${file}: 非公開ファイル`); continue; }
  const full = path.join(root, file);
  if (fs.lstatSync(full).isSymbolicLink()) { failures.push(`${file}: シンボリックリンク`); continue; }
  const content = fs.readFileSync(full, 'utf8');
  if (content.includes('/Users/' + username) || content.includes('/home/' + username)) failures.push(`${file}: 個人ホームパス`);
  if (secrets.some(secret => content.includes(secret))) failures.push(`${file}: ローカル認証情報`);
  const emails = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (emails.some(email => !/@(?:example\.(?:com|org)|users\.noreply\.github\.com)$/i.test(email))) failures.push(`${file}: 実メールの可能性`);
  if (/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)/.test(content)) failures.push(`${file}: トークン・秘密鍵の可能性`);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`公開予定${files.length}ファイル：ローカル認証情報・個人パス・実メール・秘密鍵の検査に合格。`);

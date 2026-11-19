const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aibangbee-check-'));
const dataDir = path.join(temp, 'data');
const uploadDir = path.join(temp, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
fs.copyFileSync(path.join(root, 'data', 'content.json'), path.join(dataDir, 'content.json'));

const port = 34000 + Math.floor(Math.random() * 10000);
const env = {
  ...process.env,
  NODE_ENV: 'development',
  SITE_URL: 'https://check.example',
  PORT: String(port),
  DATA_DIR: dataDir,
  UPLOAD_DIR: uploadDir,
  DATABASE_URL: '',
  DATABASE_SSL: 'disable',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  SESSION_SECRET: 'local-check-only-secret-with-at-least-32-characters',
  ADMIN_USERNAME: 'local-check-admin',
  ADMIN_PASSWORD: 'local-check-password-that-is-long-enough'
};
const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
child.stdout.on('data', chunk => logs += chunk.toString());
child.stderr.on('data', chunk => logs += chunk.toString());

async function run() {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) { ready = true; break; } } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Server did not start.\n${logs}`);
  const tests = [
    ['home page', '/', 200],
    ['booking API route exists', '/api/health', 200],
    ['privacy page', '/privacy.html', 200],
    ['terms page', '/terms.html', 200],
    ['robots file', '/robots.txt', 200],
    ['sitemap file', '/sitemap.xml', 200],
    ['manifest file', '/site.webmanifest', 200],
    ['custom 404 page', '/this-page-does-not-exist', 404],
    ['server source blocked', '/server.js', 404],
    ['environment file blocked', '/.env', 404],
    ['database content blocked', '/data/content.json', 404],
    ['package metadata blocked', '/package.json', 404],
    ['admin dashboard redirects while signed out', '/admin-dashboard.html', 302],
    ['admin script blocked while signed out', '/admin-dashboard.js', 401],
    ['unknown API route blocked', '/api/not-a-real-route', 404]
  ];
  let failures = 0;
  for (const [label, route, expected] of tests) {
    const response = await fetch(base + route, { redirect: 'manual' });
    const pass = response.status === expected;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: expected ${expected}, received ${response.status}`);
    if (!pass) failures++;
  }

  const tomorrow = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const booking = await fetch(base + '/api/consultations', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ name: 'Local Test Visitor', email: 'test@example.com', phone: '+234 802 000 0000',
      practice: 'Corporate Law', date: tomorrow, time: '09:00 AM', details: 'Automated local check', website: '', privacyConsent: true })
  });
  const bookingData = await booking.json();
  console.log(`${booking.status === 201 ? 'PASS' : 'FAIL'} consultation submission: received ${booking.status}`);
  if (booking.status !== 201) failures++;
  const login = await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username: 'local-check-admin', password: 'local-check-password-that-is-long-enough' })
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  console.log(`${login.status === 200 && cookie ? 'PASS' : 'FAIL'} staff login creates a session: received ${login.status}`);
  if (login.status !== 200 || !cookie) failures++;
  if (cookie) {
    const dashboardPage = await fetch(base + '/admin-dashboard.html', { headers: { Cookie: cookie }, redirect: 'manual' });
    console.log(`${dashboardPage.status === 200 ? 'PASS' : 'FAIL'} authenticated dashboard is accessible: received ${dashboardPage.status}`);
    if (dashboardPage.status !== 200) failures++;
    const backup = await fetch(base + '/api/admin/backup', { headers: { Cookie: cookie } });
    const backupData = await backup.json();
    console.log(`${backup.status === 200 && backupData.content ? 'PASS' : 'FAIL'} admin JSON backup downloads`);
    if (backup.status !== 200 || !backupData.content) failures++;
    const admin = await fetch(base + '/api/admin/content', { headers: { Cookie: cookie } });
    const adminData = await admin.json();
    const saved = adminData.consultations?.find(item => item.reference === bookingData.reference);
    console.log(`${saved ? 'PASS' : 'FAIL'} submitted consultation appears in dashboard API`);
    if (!saved) failures++;
    if (saved) {
      const changed = await fetch(base + `/api/admin/consultations/${saved.id}`, {
        method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify({ status: 'Contacted' })
      });
      console.log(`${changed.status === 200 ? 'PASS' : 'FAIL'} consultation status can be updated: received ${changed.status}`);
      if (changed.status !== 200) failures++;
      const deleted = await fetch(base + `/api/admin/consultations/${saved.id}`, {
        method: 'DELETE', headers: { Cookie: cookie, Origin: base }
      });
      console.log(`${deleted.status === 200 ? 'PASS' : 'FAIL'} test consultation can be deleted: received ${deleted.status}`);
      if (deleted.status !== 200) failures++;
    }
  }
  const homeHtml = await (await fetch(base + '/')).text();
  const canonicalPass = homeHtml.includes('https://check.example/');
  console.log(`${canonicalPass ? 'PASS' : 'FAIL'} SITE_URL replaces canonical domain placeholder`);
  if (!canonicalPass) failures++;
  const invalidPhone = await fetch(base + '/api/consultations', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ name: 'Local Test Visitor', email: 'test@example.com', phone: '12345',
      practice: 'Corporate Law', date: '2099-01-01', time: '09:00 AM', details: '', website: '', privacyConsent: true })
  });
  console.log(`${invalidPhone.status === 400 ? 'PASS' : 'FAIL'} invalid Nigerian phone number is rejected: received ${invalidPhone.status}`);
  if (invalidPhone.status !== 400) failures++;
  if (failures) throw new Error(`${failures} local checks failed.`);
  console.log(`\nAll ${tests.length + 9} local route, booking and admin checks passed.`);
}
run().catch(error => { console.error(error.message); process.exitCode = 1; })
.finally(() => {
  child.kill();
  setTimeout(() => fs.rmSync(temp, { recursive: true, force: true }), 250);
});

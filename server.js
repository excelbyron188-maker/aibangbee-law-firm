require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'content.json');
const isProduction = process.env.NODE_ENV === 'production';
const siteUrl = String(process.env.SITE_URL || 'https://YOUR-DOMAIN').replace(/\/+$/, '');
const databaseUrl = process.env.DATABASE_URL;
const cloudinaryConfig = { cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET };
const cloudinaryConfigured = Object.values(cloudinaryConfig).every(Boolean);
if (Object.values(cloudinaryConfig).some(Boolean) && !cloudinaryConfigured) {
  console.error('Cloudinary configuration is incomplete. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together.');
  process.exit(1);
}
// Where uploaded images are kept when no database is configured (local development fallback).
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(PUBLIC_DIR, 'assets', 'uploads');
// Common options for every static file the server sends.
const FILE_OPTIONS = { root: PUBLIC_DIR, dotfiles: 'ignore', etag: true, maxAge: 0 };
// The ONLY files in the project root that visitors may download. Everything else in the root
// (server.js, package.json, .env, data/, node_modules/, README.md, admin-dashboard.html ...) is never served
// by the static layer. To publish a new root-level page, script or stylesheet, add its filename here.
const PUBLIC_ROOT_FILES = ['index.html', 'styles.css', 'script.js', 'admin-login.js', 'privacy.html', 'terms.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest', '404.html', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
let pool = null;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET is missing or too short. Add a random secret of at least 32 characters.');
  process.exit(1);
}
if (!process.env.ADMIN_USERNAME || (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH)) {
  console.error('Set ADMIN_USERNAME and either ADMIN_PASSWORD or ADMIN_PASSWORD_HASH.');
  process.exit(1);
}
if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 14) {
  console.error('ADMIN_PASSWORD must be at least 14 characters. Use a unique password or configure ADMIN_PASSWORD_HASH.');
  process.exit(1);
}
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ cases: [], attorneys: [], consultations: [], practiceImages: {}, heroImage: '' }, null, 2));

function emptyData() { return { cases: [], attorneys: [], news: [], faqs: [], consultations: [], practiceImages: {}, heroImage: '' }; }
function normalizeData(d) {
  d = d && typeof d === 'object' ? d : {};
  return { cases: Array.isArray(d.cases) ? d.cases : [], attorneys: Array.isArray(d.attorneys) ? d.attorneys : [], news: Array.isArray(d.news) ? d.news : [], faqs: Array.isArray(d.faqs) ? d.faqs : [], consultations: Array.isArray(d.consultations) ? d.consultations : [], practiceImages: d.practiceImages && typeof d.practiceImages === 'object' ? d.practiceImages : {}, siteImages: d.siteImages && typeof d.siteImages === 'object' && !Array.isArray(d.siteImages) ? d.siteImages : {}, heroImage: typeof d.heroImage === 'string' ? d.heroImage : '' };
}
function readLocalData() {
  try { return normalizeData(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); }
  catch (err) { console.error('Could not read data/content.json:', err.message); return emptyData(); }
}
function writeLocalData(data) {
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(normalizeData(data), null, 2), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}
async function readData() {
  if (!pool) return readLocalData();
  const result = await pool.query('SELECT content FROM site_state WHERE id = 1');
  return normalizeData(result.rows[0]?.content || emptyData());
}
let lastRetentionCleanup = 0;
async function cleanupExpiredConsultations(force = false) {
  const now = Date.now();
  if (!force && now - lastRetentionCleanup < 60 * 60 * 1000) return;
  lastRetentionCleanup = now;
  if (!pool) {
    const data = readLocalData();
    const cutoff = now - 365 * 24 * 60 * 60 * 1000;
    const kept = data.consultations.filter(item => {
      const created = Date.parse(item.createdAt || '');
      return Number.isFinite(created) && created >= cutoff;
    });
    if (kept.length !== data.consultations.length) {
      data.consultations = kept;
      writeLocalData(data);
    }
    return;
  }
  await pool.query(`UPDATE site_state SET content = jsonb_set(content, '{consultations}',
    COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(COALESCE(content->'consultations','[]'::jsonb)) AS items(item)
    WHERE NULLIF(item->>'createdAt','') IS NOT NULL AND (item->>'createdAt')::timestamptz >= NOW() - INTERVAL '12 months'), '[]'::jsonb), true),
    updated_at = NOW() WHERE id = 1`);
}
async function writeData(data) {
  data = normalizeData(data);
  if (!pool) return writeLocalData(data);
  await pool.query(`INSERT INTO site_state (id, content, updated_at) VALUES (1, $1::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`, [JSON.stringify(data)]);
}
function cleanString(value, max = 3000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function normalizeNigeriaPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) return '+234' + digits.slice(1);
  if (digits.length === 13 && digits.startsWith('234')) return '+' + digits;
  return '';
}
function adminOnly(req, res, next) {
  if (req.session && req.session.isAdmin === true) return next();
  return res.status(401).json({ error: 'Please sign in to access this function.' });
}
app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin-')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
});
app.use((req, res, next) => {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  const host = req.get('x-forwarded-host') || req.get('host');
  if ((origin && (() => { try { return new URL(origin).host === host; } catch (_) { return false; } })()) || (!origin && fetchSite === 'same-origin')) return next();
  return res.status(403).json({ error: 'This request could not be verified. Refresh the page and try again.' });
});
class PgSessionStore extends session.Store {
  constructor(db) { super(); this.db = db; }
  get(sid, cb) { this.db.query('SELECT sess FROM user_sessions WHERE sid=$1 AND expire > NOW()', [sid]).then(r=>cb(null,r.rows[0]?.sess || null)).catch(cb); }
  set(sid, sess, cb=()=>{}) { const expiry = new Date(sess.cookie?.expires || Date.now()+7200000); this.db.query('INSERT INTO user_sessions(sid,sess,expire) VALUES($1,$2,$3) ON CONFLICT(sid) DO UPDATE SET sess=EXCLUDED.sess,expire=EXCLUDED.expire',[sid,sess,expiry]).then(()=>cb()).catch(cb); }
  destroy(sid, cb=()=>{}) { this.db.query('DELETE FROM user_sessions WHERE sid=$1',[sid]).then(()=>cb()).catch(cb); }
  touch(sid, sess, cb=()=>{}) { this.set(sid,sess,cb); }
}
app.use(session({
  name: 'aibangbee_admin', secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
  store: new (class extends session.Store { get(sid,cb){ return pool ? new PgSessionStore(pool).get(sid,cb) : memorySessionStore.get(sid,cb); } set(sid,sess,cb){ return pool ? new PgSessionStore(pool).set(sid,sess,cb) : memorySessionStore.set(sid,sess,cb); } destroy(sid,cb){ return pool ? new PgSessionStore(pool).destroy(sid,cb) : memorySessionStore.destroy(sid,cb); } touch(sid,sess,cb){ return pool ? new PgSessionStore(pool).touch(sid,sess,cb) : memorySessionStore.touch(sid,sess,cb); } })(),
  cookie: { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 2 * 60 * 60 * 1000 }
}));

const memorySessionStore = new session.MemoryStore();
const loginAttempts = new Map();
const consultationAttempts = new Map();
function rateKey(prefix, req, extra='') { return prefix + ':' + crypto.createHash('sha256').update(String(req.ip || 'unknown') + ':' + extra).digest('hex'); }
async function consultationLimiter(req,res,next){
  try {
    const key=rateKey('consultation',req);
    if(pool){const r=await pool.query(`INSERT INTO rate_limits(rate_key,window_started_at,hits) VALUES($1,NOW(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started_at=CASE WHEN rate_limits.window_started_at < NOW()-INTERVAL '1 hour' THEN NOW() ELSE rate_limits.window_started_at END,hits=CASE WHEN rate_limits.window_started_at < NOW()-INTERVAL '1 hour' THEN 1 ELSE rate_limits.hits+1 END RETURNING hits`,[key]);if(r.rows[0].hits>5)return res.status(429).json({error:'Too many requests. Please wait before trying again.'});}
    else {const now=Date.now(),r=consultationAttempts.get(key);if(r&&r.until>now&&r.count>=5)return res.status(429).json({error:'Too many requests. Please wait before trying again.'});if(!r||r.until<=now)consultationAttempts.set(key,{count:0,until:now+3600000});consultationAttempts.get(key).count++;}
    next();
  } catch(err){next(err);}
}
async function loginLimiter(req,res,next){
  try {
    const extra=cleanString(req.body.username,100).toLowerCase(),key=rateKey('login',req,extra);
    if(pool){const r=await pool.query(`INSERT INTO rate_limits(rate_key,window_started_at,hits) VALUES($1,NOW(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started_at=CASE WHEN rate_limits.window_started_at < NOW()-INTERVAL '15 minutes' THEN NOW() ELSE rate_limits.window_started_at END,hits=CASE WHEN rate_limits.window_started_at < NOW()-INTERVAL '15 minutes' THEN 1 ELSE rate_limits.hits+1 END RETURNING hits`,[key]);if(r.rows[0].hits>8)return res.status(429).json({error:'Too many login attempts. Please wait 15 minutes and try again.'});}
    else {const now=Date.now(),r=loginAttempts.get(key);if(r&&r.until>now&&r.count>=8)return res.status(429).json({error:'Too many login attempts. Please wait 15 minutes and try again.'});if(!r||r.until<=now)loginAttempts.set(key,{count:0,until:now+900000});loginAttempts.get(key).count++;}
    next();
  } catch(err){next(err);}
}
app.get('/admin-login.html', (req, res) => { res.setHeader('X-Robots-Tag','noindex, nofollow'); if(req.session?.isAdmin)return res.redirect('/admin-dashboard.html'); res.sendFile('admin-login.html', FILE_OPTIONS); });
// Dashboard page and its script are only sent to a signed-in administrator. (The admin API below is
// protected separately by adminOnly, so security never depends on these two files being hidden.)
app.get('/admin-dashboard.html', (req, res) => {
  if (!req.session?.isAdmin) return res.redirect('/admin-login.html');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile('admin-dashboard.html', { root: ROOT, dotfiles: 'deny', maxAge: 0 });
});
app.get('/admin-dashboard.css', (req, res) => {
  if (!req.session?.isAdmin) return res.status(401).type('text/plain').send('Please sign in to access this file.');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile('admin-dashboard.css', { root: ROOT, dotfiles: 'deny', maxAge: 0 });
});
app.get('/admin-dashboard.js', (req, res) => {
  if (!req.session?.isAdmin) return res.status(401).type('text/plain').send('Please sign in to access this file.');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile('admin-dashboard.js', { root: ROOT, dotfiles: 'deny', maxAge: 0 });
});
app.get('/admin.html', (_req, res) => res.redirect('/admin-login.html'));
app.get('/api/admin/session', (req, res) => { res.setHeader('Cache-Control','no-store'); res.setHeader('X-Robots-Tag','noindex, nofollow'); res.json({ authenticated: req.session?.isAdmin === true, username: req.session?.isAdmin ? process.env.ADMIN_USERNAME : null }); });
app.post('/api/admin/login', loginLimiter, async (req, res, next) => {
  const username = cleanString(req.body.username, 100), password = typeof req.body.password === 'string' ? req.body.password : '';
  const key = rateKey('login', req, username.toLowerCase());
  const usernameOk = username === process.env.ADMIN_USERNAME;
  let passwordOk = false;
  try { passwordOk = process.env.ADMIN_PASSWORD_HASH ? await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH) : password === process.env.ADMIN_PASSWORD; } catch (_) {}
  if (!usernameOk || !passwordOk) return res.status(401).json({ error: 'The username or password is incorrect.' });
  loginAttempts.delete(key);
  try { if (pool) await pool.query('DELETE FROM rate_limits WHERE rate_key=$1', [rateKey('login', req, username.toLowerCase())]); } catch (err) { return next(err); }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start a secure session. Please try again.' });
    req.session.isAdmin = true;
    req.session.save(err2 => err2 ? res.status(500).json({ error: 'Could not save your session. Please try again.' }) : res.json({ ok: true, redirect: '/admin-dashboard.html' }));
  });
});
app.post('/api/admin/logout', adminOnly, (req, res) => req.session.destroy(() => {
  res.clearCookie('aibangbee_admin', { httpOnly: true, secure: isProduction, sameSite: 'strict' }); res.json({ ok: true });
}));

app.get('/api/health', async (_req, res) => {
  try { if (pool) await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (_) { res.status(503).json({ ok: false, database: 'unavailable' }); }
});
app.get('/api/public-content', async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30');
    const data = await readData();
    res.json({ cases: data.cases.filter(x => x.published !== false), attorneys: data.attorneys.filter(x => x.published !== false && !/^(attorney profile|hhhhhh)$/i.test(String(x.name || '').trim())), news: data.news.filter(x => x.published !== false), faqs: data.faqs.filter(x => x.published !== false), practiceImages: data.practiceImages || {}, heroImage: data.heroImage || '', siteImages: data.siteImages || {} });
  } catch (err) { next(err); }
});
// Keep this exact time-slot list in sync with CLIENT_CONSULTATION_TIMES in public/script.js and the calendar buttons in public/index.html.
const ALLOWED_CONSULTATION_TIMES = ['08:00 AM','09:00 AM','10:30 AM','01:00 PM','02:30 PM','04:00 PM','05:30 PM','07:00 PM','08:30 PM'];
async function sendConsultationNotification(consultation) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: ['aibangbeelaw@gmail.com'],
        subject: `New consultation request — ${consultation.reference}`,
        text: [
          'A new consultation request has been received.',
          `Reference: ${consultation.reference}`,
          `Name: ${consultation.name}`,
          `Email: ${consultation.email}`,
          `Phone: ${consultation.phone}`,
          `Practice area: ${consultation.practice}`,
          `Preferred date: ${consultation.date}`,
          `Preferred time (WAT): ${consultation.time}`,
          `Additional details: ${consultation.details || 'None supplied'}`,
          '',
          'Please sign in to the website dashboard to review and manage this request.'
        ].join('\n')
      })
    });
    if (!response.ok) console.error('Consultation notification email was not accepted by the email provider.');
    // Send the client a separate acknowledgement with their requested slot and reference.
    const clientResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [consultation.email],
        subject: `We received your consultation request — ${consultation.reference}`,
        text: [
          `Dear ${consultation.name},`,
          '',
          'Thank you for contacting Aibangbee Law Firm. We have received your consultation request.',
          `Practice area: ${consultation.practice}`,
          `Preferred date: ${consultation.date}`,
          `Preferred time: ${consultation.time} WAT`,
          `Reference: ${consultation.reference}`,
          '',
          'Your requested date and time are preferences and are not yet confirmed. Our team will contact you to confirm availability and provide any further consultation details.',
          '',
          'Please keep this email for your records.',
          'Aibangbee Law Firm',
          'aibangbeelaw@gmail.com | 0802 329 8459'
        ].join('\\n')
      })
    });
    if (!clientResponse.ok) console.error('Client consultation acknowledgement email was not accepted by the email provider.');
  } catch (_) {
    console.error('Consultation notification email could not be sent.');
  } finally { clearTimeout(timeout); }
}
app.post('/api/consultations', consultationLimiter, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = cleanString(b.name, 120), email = cleanString(b.email, 200), phone = normalizeNigeriaPhone(cleanString(b.phone, 60));
    const practice = cleanString(b.practice, 100), date = cleanString(b.date, 10), time = cleanString(b.time, 30), details = cleanString(b.details, 1500);
    if (cleanString(b.website, 200)) return res.status(400).json({ error: 'Unable to process this request.' });
    if (b.privacyConsent !== true) return res.status(400).json({ error: 'Please confirm that you have read the Privacy Notice.' });
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || !practice || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time)
      return res.status(400).json({ error: 'Please complete all required fields with valid details.' });
    const parsedDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== date || date < new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })) return res.status(400).json({ error: 'Please choose a valid future date.' });
    if (parsedDate.getUTCDay() === 0) return res.status(400).json({ error: 'Consultations are available Monday to Saturday. Please choose another date.' });
    if (!ALLOWED_CONSULTATION_TIMES.includes(time)) return res.status(400).json({ error: 'Please choose an available preferred time.' });
    const data = await readData(), reference = 'ALF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const consultation = { id: crypto.randomUUID(), reference, name, email, phone, practice, date, time, details, status: 'New', createdAt: new Date().toISOString() };
    data.consultations.unshift(consultation);
    if (pool) {
      // Append atomically in PostgreSQL so simultaneous bookings cannot overwrite one another.
      const saved = await pool.query(`UPDATE site_state SET content = jsonb_set(COALESCE(content, '{}'::jsonb), '{consultations}', jsonb_build_array($1::jsonb) || COALESCE(content->'consultations', '[]'::jsonb), true), updated_at = NOW() WHERE id = 1 RETURNING content->'consultations' AS consultations`, [JSON.stringify(consultation)]);
      if (!saved.rowCount) throw new Error('Website content storage is not initialised. Please try again shortly.');
    } else { await writeData(data); }
    // Notification is optional and must never undo or reject a successfully saved request.
    await sendConsultationNotification(consultation);
    res.status(201).json({ ok: true, reference });
  } catch (err) { next(err); }
});
app.get('/api/admin/backup', adminOnly, async (_req, res, next) => {
  try {
    const data = await readData();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="aibangbee-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ exportedAt: new Date().toISOString(), version: 1, content: data });
  } catch (err) { next(err); }
});
app.get('/api/admin/content', adminOnly, async (_req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); const d = await readData(); res.json({ cases: d.cases, attorneys: d.attorneys, news: d.news, faqs: d.faqs, consultations: d.consultations, practiceImages: d.practiceImages || {}, heroImage: d.heroImage || '', siteImages: d.siteImages || {} }); }
  catch (err) { next(err); }
});

const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => allowedMimes.has(file.mimetype) ? cb(null, true) : cb(new Error('Please upload a JPG, PNG, WEBP, or GIF image.')) });
async function uploadToCloudinary(file) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'aibangbee-law-firm';
  const transformation = 'q_auto,f_auto';
  // Cloudinary signatures are generated server-side. The API secret is never sent to the browser.
  const toSign = `folder=${folder}&timestamp=${timestamp}&transformation=${transformation}${cloudinaryConfig.apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'law-firm-image');
  form.append('api_key', cloudinaryConfig.apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('transformation', transformation);
  form.append('signature', signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryConfig.cloudName)}/image/upload`, { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url) {
    console.error('Cloudinary upload failed:', result.error?.message || response.statusText);
    throw new Error('Cloudinary could not upload this image. Check the Cloudinary environment variables and try again.');
  }
  return result.secure_url;
}
app.post('/api/admin/upload-image', adminOnly, (req, res, next) => upload.single('image')(req, res, async err => {
  try {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : err.message || 'Image upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, WEBP, or GIF image first.' });
    // Verify file signatures rather than trusting the browser-provided MIME type.
    const b = req.file.buffer;
    const valid = (req.file.mimetype === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8) ||
      (req.file.mimetype === 'image/png' && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
      (req.file.mimetype === 'image/gif' && b.subarray(0, 3).toString() === 'GIF') ||
      (req.file.mimetype === 'image/webp' && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP');
    if (!valid) return res.status(400).json({ error: 'The file content does not match a supported image format.' });
    if (cloudinaryConfigured) {
      const image = await uploadToCloudinary(req.file);
      return res.status(201).json({ ok: true, image });
    }
    const id = crypto.randomUUID();
    if (pool) {
      await pool.query('INSERT INTO site_images (id, mime_type, image_data) VALUES ($1, $2, $3)', [id, req.file.mimetype, req.file.buffer]);
      return res.status(201).json({ ok: true, image: `/api/images/${id}` });
    }
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[req.file.mimetype];
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
    return res.status(201).json({ ok: true, image: `/assets/uploads/${filename}` });
  } catch (e) { next(e); }
}));
app.get('/api/images/:id', async (req, res, next) => {
  try {
    if (!pool || !/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).send('Image not found');
    const result = await pool.query('SELECT mime_type, image_data FROM site_images WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).send('Image not found');
    res.setHeader('Content-Type', result.rows[0].mime_type);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.rows[0].image_data);
  } catch (err) { next(err); }
});
// Locally stored uploads (only used when DATABASE_URL is not set, or for images uploaded before the database was added).
app.use('/assets/uploads', express.static(UPLOAD_DIR, { index: false, dotfiles: 'ignore', etag: true, maxAge: isProduction ? '1h' : 0 }));
function isAllowedStoredImage(image) {
  const cloudinaryPrefix = cloudinaryConfigured ? `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/image/upload/` : '';
  return image.startsWith('/api/images/') || image.startsWith('/assets/uploads/') || Boolean(cloudinaryPrefix && image.startsWith(cloudinaryPrefix));
}
app.put('/api/admin/hero-image', adminOnly, async (req, res, next) => {
  try {
    const image = cleanString(req.body.image, 1000);
    if (!isAllowedStoredImage(image)) return res.status(400).json({ error: 'Upload a hero image before saving.' });
    const data = await readData(); data.heroImage = image; await writeData(data); res.json({ ok: true, image });
  } catch (err) { next(err); }
});
// Editable pictures on the public site: hero background, "Meet Aibangbee Law Firm" (about) and "We stand for what matters" (stand).
const SITE_IMAGE_SLOTS = ['hero', 'about', 'stand'];
app.put('/api/admin/site-images/:slot', adminOnly, async (req, res, next) => {
  try {
    if (!SITE_IMAGE_SLOTS.includes(req.params.slot)) return res.status(400).json({ error: 'Unknown image position.' });
    const image = cleanString(req.body.image, 1000);
    if (!isAllowedStoredImage(image)) return res.status(400).json({ error: 'Upload an image before saving.' });
    const data = await readData(); data.siteImages = data.siteImages || {}; data.siteImages[req.params.slot] = image;
    if (req.params.slot === 'hero') data.heroImage = image;
    await writeData(data); res.json({ ok: true, image });
  } catch (err) { next(err); }
});
app.delete('/api/admin/site-images/:slot', adminOnly, async (req, res, next) => {
  try {
    if (!SITE_IMAGE_SLOTS.includes(req.params.slot)) return res.status(400).json({ error: 'Unknown image position.' });
    const data = await readData(); data.siteImages = data.siteImages || {}; delete data.siteImages[req.params.slot];
    if (req.params.slot === 'hero') data.heroImage = '';
    await writeData(data); res.json({ ok: true });
  } catch (err) { next(err); }
});
app.put('/api/admin/practice-images/:slug', adminOnly, async (req, res, next) => {
  try {
    const allowed = ['business-law','real-estate','family-law','estate-planning','criminal-defense','personal-injury','dispute-resolution','litigation'];
    if (!allowed.includes(req.params.slug)) return res.status(400).json({ error: 'Unknown practice area.' });
    const image = cleanString(req.body.image, 500);
    if (!isAllowedStoredImage(image)) return res.status(400).json({ error: 'Upload an image before saving.' });
    const data = await readData(); data.practiceImages = data.practiceImages || {}; data.practiceImages[req.params.slug] = image;
    await writeData(data); res.json({ ok: true, image });
  } catch (err) { next(err); }
});
// Consultation routes must be registered BEFORE the generic '/api/admin/:kind/:id' routes below,
// otherwise DELETE /api/admin/consultations/:id is caught there and fails with "Unknown collection."
app.patch('/api/admin/consultations/:id', adminOnly, async (req, res, next) => {
  try {
    const allowed = ['New', 'Contacted', 'Scheduled', 'Completed', 'Closed'], data = await readData(), item = data.consultations.find(x => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Request not found.' });
    const status = cleanString(req.body.status, 30); if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid request status.' });
    item.status = status; await writeData(data); res.json(item);
  } catch (err) { next(err); }
});
app.delete('/api/admin/consultations/:id', adminOnly, async (req, res, next) => {
  try {
    const data = await readData(), old = data.consultations.length;
    data.consultations = data.consultations.filter(x => x.id !== req.params.id);
    if (old === data.consultations.length) return res.status(404).json({ error: 'Request not found.' });
    await writeData(data); res.json({ ok: true });
  } catch (err) { next(err); }
});
function collectionConfig(kind) {
  if (kind === 'cases') return { key: 'cases', required: ['title', 'area', 'description'], fields: ['title', 'area', 'image', 'description', 'result', 'published'] };
  if (kind === 'attorneys') return { key: 'attorneys', required: ['name', 'title', 'qualifications', 'bio'], fields: ['name', 'title', 'image', 'qualifications', 'bio', 'published'] };
  if (kind === 'news') return { key: 'news', required: ['title', 'category', 'description'], fields: ['title', 'category', 'image', 'description', 'date', 'url', 'published'] };
  if (kind === 'faqs') return { key: 'faqs', required: ['question', 'answer'], fields: ['question', 'answer', 'published'] };
  return null;
}
app.post('/api/admin/:kind', adminOnly, async (req, res, next) => {
  try {
    const cfg = collectionConfig(req.params.kind); if (!cfg) return res.status(404).json({ error: 'Unknown collection.' });
    const item = {};
    for (const field of cfg.fields) item[field] = field === 'published' ? req.body[field] !== false : cleanString(req.body[field], ['description','bio','qualifications','answer'].includes(field) ? 5000 : 500);
    if (cfg.required.some(f => !item[f])) return res.status(400).json({ error: 'Please fill in all required fields.' });
    if (req.params.kind === 'news' && item.url && !/^https:\/\//i.test(item.url)) return res.status(400).json({ error: 'Article links must begin with https://.' });
    item.id = crypto.randomUUID(); const data = await readData(); data[cfg.key].unshift(item); await writeData(data); res.status(201).json(item);
  } catch (err) { next(err); }
});
app.put('/api/admin/:kind/:id', adminOnly, async (req, res, next) => {
  try {
    const cfg = collectionConfig(req.params.kind); if (!cfg) return res.status(404).json({ error: 'Unknown collection.' });
    const data = await readData(), idx = data[cfg.key].findIndex(x => x.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Item not found.' });
    const item = { ...data[cfg.key][idx] };
    for (const field of cfg.fields) if (field === 'published') item[field] = req.body[field] !== false;
      else if (Object.prototype.hasOwnProperty.call(req.body, field)) item[field] = cleanString(req.body[field], ['description','bio','qualifications','answer'].includes(field) ? 5000 : 500);
    if (cfg.required.some(f => !item[f])) return res.status(400).json({ error: 'Please fill in all required fields.' });
    if (req.params.kind === 'news' && item.url && !/^https:\/\//i.test(item.url)) return res.status(400).json({ error: 'Article links must begin with https://.' });
    data[cfg.key][idx] = item; await writeData(data); res.json(item);
  } catch (err) { next(err); }
});
app.delete('/api/admin/:kind/:id', adminOnly, async (req, res, next) => {
  try {
    const cfg = collectionConfig(req.params.kind); if (!cfg) return res.status(404).json({ error: 'Unknown collection.' });
    const data = await readData(), old = data[cfg.key].length; data[cfg.key] = data[cfg.key].filter(x => x.id !== req.params.id);
    if (data[cfg.key].length === old) return res.status(404).json({ error: 'Item not found.' });
    await writeData(data); res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- Public website files -------------------------------------------------------------------------
// Only the whitelisted root files and the assets/ folder are served. This is deliberately NOT
// express.static(ROOT): that would publish server.js, package.json, data/, node_modules/ and README.md,
// and a block-list of "secret" names can be bypassed (for example with percent-encoded paths such as /%61dmin-dashboard.html).
function sendPublicRootFile(file, res) {
  if (['index.html', 'privacy.html', 'terms.html', 'robots.txt', 'sitemap.xml'].includes(file)) {
    fs.readFile(path.join(PUBLIC_DIR, file), 'utf8', (err, content) => {
      if (err) return res.status(404).send('Not found');
      const type = file.endsWith('.xml') ? 'application/xml' : file.endsWith('.txt') ? 'text/plain' : 'text/html';
      res.type(type).send(content.replaceAll('https://YOUR-DOMAIN', siteUrl));
    });
    return;
  }
  res.sendFile(file, FILE_OPTIONS);
}
app.get('/', (_req, res) => sendPublicRootFile('index.html', res));
for (const file of PUBLIC_ROOT_FILES) app.get('/' + file, (_req, res) => sendPublicRootFile(file, res));
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { index: false, dotfiles: 'ignore', etag: true, maxAge: isProduction ? '1h' : 0 }));

// Unknown API paths get a JSON 404 instead of the home page.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
// Page-style paths (no dot in the last segment) fall back to the home page; a missing file such as /missing.js or /.env is a real 404.
app.get('*', (req, res, next) => {
  if (path.basename(req.path).includes('.')) return next();
  res.status(404).sendFile('404.html', FILE_OPTIONS);
});
app.use((req, res) => {
  if (path.extname(req.path).toLowerCase() === '.html') return res.status(404).sendFile('404.html', FILE_OPTIONS);
  res.status(404).type('text/plain').send('Not found');
});
app.use((err, _req, res, _next) => {
  console.error('Request error:', err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: isProduction ? 'The server could not complete that request.' : err.message });
});

async function start(listen = true) {
  if (isProduction && !siteUrl.startsWith('https://') || isProduction && siteUrl.includes('YOUR-DOMAIN')) throw new Error('SITE_URL must be your public HTTPS website URL in production.');
  if (isProduction && !cloudinaryConfigured) throw new Error('Cloudinary is required in production. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  if (databaseUrl) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: true }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000 });
    // Neon free databases sleep when idle; the first connection can take a while to wake them, so retry.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { await pool.query('SELECT 1'); break; }
      catch (err) {
        if (attempt === 3) throw err;
        console.warn(`Database is not ready yet (attempt ${attempt}/3: ${err.message}). Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        content JSONB NOT NULL DEFAULT '{"cases":[],"attorneys":[],"news":[],"faqs":[],"consultations":[],"practiceImages":{},"heroImage":""}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS user_sessions (sid VARCHAR PRIMARY KEY, sess JSONB NOT NULL, expire TIMESTAMPTZ NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits (rate_key TEXT PRIMARY KEY, window_started_at TIMESTAMPTZ NOT NULL, hits INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions(expire);
      CREATE TABLE IF NOT EXISTS site_images (
        id UUID PRIMARY KEY,
        mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/gif')),
        image_data BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query('DELETE FROM user_sessions WHERE expire < NOW()');
    await pool.query("DELETE FROM rate_limits WHERE window_started_at < NOW()-INTERVAL '1 day'");
    const exists = await pool.query('SELECT 1 FROM site_state WHERE id = 1');
    if (!exists.rowCount) {
      await pool.query('INSERT INTO site_state (id, content) VALUES (1, $1::jsonb)', [JSON.stringify(readLocalData())]);
      console.log('Initial website content copied from data/content.json into PostgreSQL.');
    }
    await pool.query(`UPDATE site_state SET content = jsonb_set(content, '{faqs}', $1::jsonb, true) WHERE id = 1 AND NOT (content ? 'faqs')`, [JSON.stringify(readLocalData().faqs)]);
    await pool.query(`UPDATE site_state SET content = jsonb_set(content, '{news}', '[]'::jsonb, true) WHERE id = 1 AND NOT (content ? 'news')`);
    const starterNews = readLocalData().news;
    if (starterNews.length) await pool.query(`UPDATE site_state SET content = jsonb_set(content, '{news}', $1::jsonb, true) WHERE id = 1 AND jsonb_array_length(COALESCE(content->'news','[]'::jsonb)) = 0`, [JSON.stringify(starterNews)]);
    await pool.query(`UPDATE site_state SET content = jsonb_set(content, '{attorneys}', COALESCE((SELECT jsonb_agg(a) FROM jsonb_array_elements(COALESCE(content->'attorneys','[]'::jsonb)) AS entries(a) WHERE lower(COALESCE(a->>'name','')) <> 'hhhhhh'), '[]'::jsonb), true) WHERE id = 1`);
    console.log(cloudinaryConfigured ? 'Cloudinary connected: new admin image uploads are stored in Cloudinary.' : 'Cloudinary is not configured: image uploads use the existing database/local fallback.');
    console.log('PostgreSQL connected: website content, rate limits and staff sessions use the database.');
  } else {
    if (isProduction) throw new Error('DATABASE_URL is required in production. Configure Neon before deploying.');
    console.warn('DATABASE_URL is not set. Using local JSON and filesystem storage; on hosted services this may not persist.');
  }
  await cleanupExpiredConsultations(true);
  if (listen) {
    const retentionTimer = setInterval(() => cleanupExpiredConsultations().catch(err => console.error('Consultation retention cleanup failed:', err.message)), 60 * 60 * 1000);
    retentionTimer.unref?.();
  }
  if (listen) app.listen(PORT, () => console.log(`Aibangbee Law Firm website running on port ${PORT}`));
}
const initPromise = require.main === module ? null : start(false);
if (require.main === module) start(true).catch(err => { console.error('Could not initialise database:', err.message); process.exit(1); });
module.exports = (req, res) => (initPromise || Promise.resolve()).then(() => app(req, res)).catch(err => { console.error('Could not initialise database:', err.message); res.statusCode = 503; res.end('Service temporarily unavailable'); });

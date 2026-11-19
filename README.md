# Aibangbee Law Firm website

Plain HTML, CSS and vanilla JavaScript with a Node.js/Express backend, Neon PostgreSQL, Cloudinary uploads and Vercel deployment.

## 1. Run locally

1. Install Node.js 20 or newer.
2. Open this project folder in VS Code.
3. In the VS Code terminal, run `npm install`.
4. Copy `.env.example` to `.env`.
5. Fill in the local environment values in `.env`. Do not send secrets in chat or commit `.env`.
6. Run `npm start`.
7. Open `http://localhost:3000`.

The local server needs `SESSION_SECRET` (at least 32 characters), `ADMIN_USERNAME`, and either `ADMIN_PASSWORD` (at least 14 characters) or `ADMIN_PASSWORD_HASH`. For real use, prefer the hash.

### Generate an administrator password hash

In the project terminal run:

```bash
node -e "const b=require('bcryptjs'); console.log(b.hashSync('REPLACE-WITH-YOUR-STRONG-PASSWORD', 12))"
```

Put the resulting hash in `ADMIN_PASSWORD_HASH`. Keep the password private. Do not put it in source code.

## 2. Folder map

- `server.js` — Express server, API, authentication, database and uploads.
- `public/index.html` — public homepage and consultation modal.
- `public/styles.css` — all public/admin styling.
- `public/script.js` — public navigation, modal, booking and dynamic content.
- `public/admin-login.html` / `public/admin-login.js` — staff sign-in.
- `admin-dashboard.html` / `admin-dashboard.js` — authenticated content dashboard.
- `public/privacy.html` / `public/terms.html` — website legal notices.
- `public/assets/` — logos, icons, visual fallbacks and share image.
- `data/content.json` — local-development content only; production content is stored in Neon.

## 3. Edit the website

- **Logo:** replace `public/assets/logo.png` (white logo for dark surfaces) and `public/assets/logo-dark.png` (dark logo for light surfaces). Keep the filenames and transparent backgrounds.
- **Hero image:** use the staff dashboard's Website pictures area to upload a hero image. The current default is a remote Unsplash background. The CSS desktop and mobile fallbacks are in `public/styles.css` in the `.hero-dark` rules (`--hero-photo`). If you want to replace the remote background manually, change both `--hero-photo` declarations to `url('/assets/hero-bg.jpg')` after placing that image in `public/assets/`.
- **About / “We stand for” images:** use Staff access → Website pictures. New uploaded images are stored in Cloudinary when configured.
- **Text and page sections:** edit `public/index.html`. Keep IDs and `data-*` attributes intact because the JavaScript uses them.
- **Legal notices:** edit `public/privacy.html` and `public/terms.html`, then ask the firm to review them before launch.
- **Domain:** set `SITE_URL` once in the environment. The server substitutes it into the homepage canonical/Open Graph tags, `robots.txt` and `sitemap.xml`.

## 4. Database and image storage

Set `DATABASE_URL` to the Neon PostgreSQL connection string. The server creates its required tables automatically. Neon Free currently includes 100 CU-hours per project each month, 1 GB of Postgres storage per project, and 5 GB of public network transfer per project. Compute scales to zero after 5 minutes of inactivity, so the first request after a quiet period can take longer. Check current quotas before relying on the free tier.

Set all three Cloudinary variables together:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Cloudinary is required in production. Uploads are limited to 5 MB and image file signatures are checked. Images use Cloudinary's `q_auto,f_auto` transformation. Local uploads are a development fallback and should not be treated as persistent production storage.

## 5. Optional email notifications

Consultation requests are saved even if email is not configured or the email provider is unavailable. To enable a staff notification to `aibangbeelaw@gmail.com`:

1. Create a free Resend account.
2. Verify a sending domain you control and configure its DNS records.
3. Create an API key.
4. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in the hosting environment. The sender must be an address on a verified domain.
5. Submit a test consultation and check the inbox and spam folder.

Resend currently advertises a free transactional allowance of 3,000 emails per month, with a 100-email daily limit and up to three verified domains. Its free tier does not require billing information according to its terms; confirm the current plan when signing up. No visitor acknowledgement email is sent by this version. Keep the API key secret.

## 6. Deploy to Vercel

**Important plan restriction:** Vercel's free Hobby plan is for personal, non-commercial use. A law firm's public business website is commercial, so the firm must use a plan that permits commercial use (currently Pro) or choose another host whose terms permit it. Do not assume Hobby is an acceptable production host for this firm.

If using a commercial Vercel plan:

1. Push this project to a private GitHub repository. Ensure `.env`, `node_modules`, `data/*.tmp`, and `public/assets/uploads/` are not committed.
2. Import the repository in Vercel and keep the project root at this folder.
3. Set the environment variables below for **Production** (and Preview only if you want preview deployments to use separate test credentials/database).
4. Set `NODE_ENV` to `production`.
5. Set `SITE_URL` to the final HTTPS domain, for example `https://www.example.com`.
6. Deploy. `vercel.json` pins the function to Cape Town (`cpt1`), the closest listed Vercel compute region to West Africa; the static CDN is globally distributed.
7. After deployment, test the live site, booking, admin sign-in, image uploads and email notifications.

### Environment variables for Vercel

Required:
- `NODE_ENV` — set to `production`.
- `SITE_URL` — public HTTPS website address, without a trailing slash.
- `SESSION_SECRET` — random secret of at least 32 characters.
- `ADMIN_USERNAME` — private staff username.
- `ADMIN_PASSWORD_HASH` — bcrypt hash of the staff password (preferred; use this instead of `ADMIN_PASSWORD`).
- `DATABASE_URL` — Neon PostgreSQL connection string.
- `CLOUDINARY_CLOUD_NAME` — Cloudinary account cloud name.
- `CLOUDINARY_API_KEY` — Cloudinary API key.
- `CLOUDINARY_API_SECRET` — Cloudinary API secret.

Optional:
- `RESEND_API_KEY` — enables staff consultation email notifications.
- `RESEND_FROM_EMAIL` — verified sender address, for example `Aibangbee Law Firm <website@your-verified-domain.com>`.
- `DATABASE_SSL` — normally leave unset; set `disable` only for local development without SSL.

Do not add `PORT`, `UPLOAD_DIR`, or `ADMIN_PASSWORD` to Vercel unless you have a specific reason. Never share environment variable values.

## 7. Backups

After signing in, use **Download backup (JSON)** in the dashboard. Store the file securely because it contains personal consultation details. The export includes website content and consultation requests. This release provides export only; it does not yet provide a one-click restore control. For a production restore, restore the JSON data to the `site_state` table in Neon with a database administrator or developer, after taking a fresh database backup. For local development, make a copy of `data/content.json` before replacing it.

## 8. Test the project

Run:

```bash
npm run check
```

This starts a temporary local server with dummy credentials and a temporary data folder. It checks the homepage, legal pages, SEO files, custom 404, admin redirect, and that sensitive files/API paths are not publicly served. It does not connect to or modify your real Neon database.

For a browser check:
1. Open Chrome DevTools → Lighthouse.
2. Select Mobile and Desktop separately.
3. Run Performance, Accessibility, Best Practices and SEO.
4. Aim for 90+ Performance and 95–100 for Accessibility, Best Practices and SEO. Real scores depend on the final domain, network, third-party hero image and uploaded image sizes.

## 9. Search visibility

1. Replace `SITE_URL` with the final domain and deploy.
2. Open Google Search Console and add the domain property.
3. Verify ownership using the DNS TXT record Google provides.
4. Submit `https://YOUR-DOMAIN/sitemap.xml` in the Sitemaps section.
5. Create or claim the firm's Google Business Profile using the firm's real address, phone and website. Complete Google's verification process and keep the details consistent.

## 10. Launch checklist

- [ ] Confirm the firm's exact address, phone and email.
- [ ] Review and approve the privacy notice and terms with Nigerian counsel / the firm's data protection lead.
- [ ] Verify all public claims listed in the project handover notes.
- [ ] Rotate any credentials that were ever included in a shared archive.
- [ ] Create production Neon and Cloudinary resources.
- [ ] Choose hosting whose terms permit a commercial law-firm website.
- [ ] Set all required environment variables and the final `SITE_URL`.
- [ ] Deploy and test homepage, legal pages, mobile navigation, booking and staff login.
- [ ] Upload final, licensed firm images and verify them on mobile.
- [ ] Test the consultation notification email if enabled.
- [ ] Download and securely store the first admin JSON backup.
- [ ] Connect the custom domain and confirm HTTPS.
- [ ] Add Google Search Console and Google Business Profile.

## 11. Important notes

- Vercel provides compression for static assets; no extra compression dependency has been added.
- `server copy.js` was an obsolete duplicate and has been removed from this package.
- The hero photo remains an Unsplash hotlink because the source image could not be downloaded during this pass. Its photographer credit remains in the HTML/CSS.
- The homepage contains legal and numeric claims that require the firm's approval before launch.
- Privacy and terms text is a technical draft, not legal advice or a compliance certification.

## 12. Claims to verify before launch

These are intentionally retained in the homepage claim configuration in `public/script.js` (`PUBLIC_CLAIMS`). The Firm must verify the evidence and confirm that publication is permitted under the Rules of Professional Conduct for Legal Practitioners before launch:

- **“Since 1993”** — verify the firm's establishment date. Safer alternative if not verified: “Serving clients in Benin City”.
- **“1,300+ clients worked with”** — verify the count and period. Safer alternative: “Supporting individuals, families and businesses”.
- **“93% reported success rate”** — verify the methodology, sample, time period and legal advertising permissibility. Safer alternative: “Client-focused representation”.
- **“Strategic legal counsel” / “Experienced counsel”** — ensure the wording accurately describes the firm's services and does not imply a guaranteed outcome.
- Case highlights and outcomes must be individually approved for publication by the Firm and the client where consent is required. No result should be presented as a guarantee.

The privacy notice and terms are technical drafts, not legal advice. The Firm should have Nigerian counsel and its data protection lead review them against the Nigeria Data Protection Act 2023, the firm's actual retention practices, provider locations and professional confidentiality obligations.

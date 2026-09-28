import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REGISTERED_USERS, SITE } from './config.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

if (!Number.isSafeInteger(REGISTERED_USERS) || REGISTERED_USERS < 0) throw new Error('REGISTERED_USERS must be a non-negative safe integer.');
if (SITE.domain) {
  let domain;
  try { domain = new URL(SITE.domain); } catch { throw new Error('Set domain to an HTTPS origin without a trailing slash.'); }
  if (domain.protocol !== 'https:' || domain.origin !== SITE.domain) throw new Error('Set domain to an HTTPS origin without a trailing slash.');
}

const canonicalUrl = SITE.domain ? `${SITE.domain}/` : '';
const imageUrl = SITE.domain ? `${SITE.domain}/assets/social-card.png` : '';
const schema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'UniMarkaz',
  alternateName: 'Uni Markaz',
  description: SITE.description,
  inLanguage: 'en-PK',
  ...(canonicalUrl ? { url: canonicalUrl } : {}),
};

const textValues = {
  TITLE: SITE.title,
  DESCRIPTION: SITE.description,
  COUNT: REGISTERED_USERS,
  ENDPOINT: SITE.formEndpoint,
  FORM_KEY: SITE.formAccessKey,
  ROBOTS: SITE.domain ? 'index, follow, max-image-preview:large' : 'noindex, follow',
};
const markupValues = {
  CANONICAL: canonicalUrl ? `<link rel="canonical" href="${escape(canonicalUrl)}"><meta property="og:url" content="${escape(canonicalUrl)}">` : '',
  SOCIAL_META: imageUrl ? `<meta property="og:image" content="${escape(imageUrl)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="UniMarkaz — Make money. Make moves. Between classes. Join the free waitlist."><meta property="og:locale" content="en_PK"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escape(imageUrl)}"><meta name="twitter:image:alt" content="UniMarkaz — Earn while you study. Join the free waitlist.">` : '<meta name="twitter:card" content="summary">',
  SCHEMA: JSON.stringify(schema).replace(/</g, '\\u003c'),
};

const template = readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const html = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
  if (Object.hasOwn(textValues, key)) return escape(textValues[key]);
  if (Object.hasOwn(markupValues, key)) return markupValues[key];
  throw new Error(`Unknown template placeholder: ${key}`);
});

mkdirSync(dist, { recursive: true });
writeFileSync(path.join(dist, 'index.html'), html);
const stylesheet = path.join(root, 'src', 'style.css');
if (existsSync(stylesheet)) copyFileSync(stylesheet, path.join(dist, 'style.css'));
writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n${SITE.domain ? `Sitemap: ${SITE.domain}/sitemap.xml\n` : ''}`);
writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${canonicalUrl ? `\n  <url><loc>${escape(canonicalUrl)}</loc></url>\n` : ''}</urlset>\n`);
console.log(`Built UniMarkaz in ${dist}. Search indexing: ${SITE.domain ? 'enabled' : 'disabled until domain is configured'}.`);

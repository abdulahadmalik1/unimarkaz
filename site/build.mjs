import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SITE } from './config.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

if (SITE.domain) {
  let domain;
  try { domain = new URL(SITE.domain); } catch { throw new Error('Set domain to an HTTPS origin without a trailing slash.'); }
  if (domain.protocol !== 'https:' || domain.origin !== SITE.domain) throw new Error('Set domain to an HTTPS origin without a trailing slash.');
}

const subPath = SITE.subPath || '';
const canonicalUrl = SITE.domain ? `${SITE.domain}${subPath}/` : '';
const imageUrl = SITE.domain ? `${SITE.domain}/assets/social-card.png` : '';
// Vercel preview deployments must stay out of search, even with the live domain configured.
// A plain local build produces production files; serve.mjs sends its own noindex header.
const isPreview = Boolean(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production');
const isIndexable = Boolean(canonicalUrl && !isPreview);
const organizationId = canonicalUrl ? `${canonicalUrl}#organization` : '#organization';
const websiteId = canonicalUrl ? `${canonicalUrl}#website` : '#website';
const schema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: 'UniMarkaz',
      alternateName: 'Uni Markaz',
      description: 'An upcoming student marketplace for university campuses across Pakistan.',
      areaServed: { '@type': 'Country', name: 'Pakistan', identifier: 'PK' },
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      ...(SITE.domain ? { logo: { '@type': 'ImageObject', url: `${SITE.domain}/assets/favicon.svg`, width: 144, height: 144 } } : {}),
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      name: 'UniMarkaz',
      alternateName: 'Uni Markaz',
      description: SITE.description,
      inLanguage: 'en-PK',
      publisher: { '@id': organizationId },
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
    },
    {
      '@type': 'WebPage',
      '@id': canonicalUrl ? `${canonicalUrl}#webpage` : '#webpage',
      name: SITE.title,
      description: SITE.description,
      inLanguage: 'en-PK',
      isPartOf: { '@id': websiteId },
      about: { '@id': organizationId },
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      ...(imageUrl ? { primaryImageOfPage: { '@type': 'ImageObject', url: imageUrl, width: 1200, height: 630 } } : {}),
    },
  ],
};

const keywords = 'student marketplace Pakistan, university marketplace Pakistan, buy sell textbooks Pakistan, campus marketplace, second-hand books university, student buy sell Lahore, student marketplace Karachi, student marketplace Islamabad, NUST marketplace, LUMS marketplace, IBA marketplace, UET Lahore, FAST NUCES, COMSATS university, campus carpool Pakistan, sell used books students, skills exchange university, student deals Pakistan, university students buy sell, Pakistan student platform, online student marketplace, cheap textbooks Pakistan, student services Pakistan, campus rides Pakistan, buy sell Rawalpindi students, student marketplace Peshawar, Faisalabad university marketplace, student marketplace Multan, UniMarkaz';
const textValues = {
  TITLE: SITE.title,
  DESCRIPTION: SITE.description,
  KEYWORDS: keywords,
  ENDPOINT: SITE.formEndpoint,
  FORM_KEY: SITE.formAccessKey,
  ROBOTS: isIndexable ? 'index, follow, max-image-preview:large' : 'noindex, follow',
};
const markupValues = {
  CANONICAL: canonicalUrl ? `<link rel="canonical" href="${escape(canonicalUrl)}"><meta property="og:url" content="${escape(canonicalUrl)}">` : '',
  SOCIAL_META: imageUrl ? `<meta property="og:image" content="${escape(imageUrl)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="UniMarkaz — Pakistan’s student marketplace. Coming soon. Join the early access list."><meta property="og:locale" content="en_PK"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escape(imageUrl)}"><meta name="twitter:image:alt" content="UniMarkaz — Pakistan’s student marketplace. Coming soon. Join the early access list.">` : '<meta property="og:locale" content="en_PK"><meta name="twitter:card" content="summary">',
  SCHEMA: JSON.stringify(schema).replace(/</g, '\\u003c'),
};

const template = readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const html = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
  if (Object.hasOwn(textValues, key)) return escape(textValues[key]);
  if (Object.hasOwn(markupValues, key)) return markupValues[key];
  throw new Error(`Unknown template placeholder: ${key}`);
});

const subDir = subPath ? path.join(dist, subPath.replace(/^\//, '')) : dist;
mkdirSync(subDir, { recursive: true });
writeFileSync(path.join(subDir, 'index.html'), html);
const stylesheet = path.join(root, 'src', 'style.css');
if (subPath) {
  // Assets are always served from root; only copy them there.
  mkdirSync(dist, { recursive: true });
  copyFileSync(stylesheet, path.join(dist, 'style.css'));
} else {
  copyFileSync(stylesheet, path.join(dist, 'style.css'));
}
const appJs = path.join(root, 'src', 'app.js');
if (subPath) {
  copyFileSync(appJs, path.join(dist, 'app.js'));
} else {
  copyFileSync(appJs, path.join(dist, 'app.js'));
}
// Source assets live outside generated output so a clean checkout builds completely.
cpSync(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });
writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n${isIndexable ? `\nSitemap: ${SITE.domain}/sitemap.xml\n` : ''}`);
// Sitemap includes the canonical subpage URL.
writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${isIndexable ? `\n  <url><loc>${escape(SITE.domain)}/</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n  <url><loc>${escape(canonicalUrl)}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` : ''}</urlset>\n`);
console.log(`Built UniMarkaz in ${subDir}. Search indexing: ${isIndexable ? 'enabled for production' : 'disabled for this preview'}.`);

# UniMarkaz — earn while you study

A responsive waitlist landing page for Pakistan’s university student marketplace. The page leads with earning from student skills, explains what is coming, and makes joining the free waitlist the primary action. Its cream, violet, tangerine and lime visual system includes an interactive skills preview, early-access invitation, and a matching social share image.

## Build and preview

Requires Node.js 18+; no dependency installation for building or serving.

From the repository root:

```sh
node site/build.mjs
node site/serve.mjs
```

Or from `site/`:

```sh
node build.mjs
node serve.mjs
```

Open http://127.0.0.1:4173. `PORT` can override the preview port. The local server sends an `X-Robots-Tag: noindex` header and is for development only. Deploy the complete `site/dist/` directory to the HTTPS static host for **unimarkaz.com**. Updating this repository does not publish the site or configure DNS.

## Editing

- `config.mjs`: canonical domain, search title, description, form endpoint, public SplitForms access key and `REGISTERED_USERS`. The count is manually configured at **100**; it is not fetched from the provider and does not change after a browser submission. Keep it aligned with the verified waitlist total.
- `src/index.html`: all landing-page copy, semantic markup, form controls, FAQ and privacy explanation.
- `src/style.css`: responsive layout, colors, focus states and motion preferences. The build copies it into `dist/style.css`.
- `dist/app.js`: interactive opportunity previews, waitlist links, motion controls and signup handling. This file is served directly and is not overwritten by the build.
- `dist/assets/`: locally served font and its license, imagery, and `social-card.png` (1200 × 630). The matching SVG is the editable source for the social artwork. Keep the PNG dimensions and build metadata in sync when replacing it.

Run the build after changes to configuration, markup or source CSS. The build rejects invalid count/domain values and unknown template placeholders. Assets and JavaScript currently live directly in `dist/`; do not clear that directory before building.

## Waitlist behavior

The form asks for an email and one interest: earning, finding help, or both. The existing SplitForms endpoint and public form access key are preserved. Success is shown only after the provider confirms `success: true`; validation, duplicate submissions, timeouts, retry messages and rate limits are handled. There are no analytics, cookies, local-storage identifiers or personal-data logs in the page.

Before public launch, confirm the form key is active, the production domain is permitted by the provider, and a test signup using an address you control is received. Automated checks use intercepted responses and must not add real subscribers. Set up the reply/unsubscribe workflow described in the privacy copy before emailing subscribers.

## Search and sharing

The generated static HTML includes a descriptive search title and description, canonical URL, WebSite JSON-LD with the UniMarkaz site name, Open Graph metadata, a large Twitter/X preview image, `robots.txt` and a single-page sitemap. Set `SITE.domain` to an empty string for a published staging build that should carry a `noindex` meta tag; rebuild before deployment. Production currently targets `https://unimarkaz.com/`.

Search content is available in the initial HTML. The page uses one H1, descriptive sections, local fonts, a compressed campus WebP with reserved dimensions, and deferred JavaScript. The campus artwork is illustrative. The page makes no fixed launch-date, university-partnership or earnings-guarantee claims. Features can evolve during development.

On the production host, redirect HTTP and alternate hostnames to the canonical HTTPS domain, enable compression and asset caching, and keep the page accessible to crawlers. Verify the property in Google Search Console and submit `https://unimarkaz.com/sitemap.xml` after deployment. Metadata and a sitemap help search engines understand and discover the page; they do not guarantee rankings or indexing.

Google references: [descriptive titles](https://developers.google.com/search/docs/appearance/title-link), [site name structured data](https://developers.google.com/search/docs/appearance/site-names), [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview).

## Verification

`verify.cjs` exercises the page in a browser, including viewport layouts, accessibility-related interactions, metadata, local assets and mocked waitlist outcomes. It uses Playwright from the available environment; it is a development check and is not required to serve the static page. Inspect its environment settings when running outside this workspace.

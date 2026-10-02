# unimarkaz — the campus early crew

A mobile-first coming-soon page for Pakistan's student marketplace. The static cobalt, cream and navy design combines oversized type, a campus noticeboard collage and the existing generated campus illustration in `assets/campus.webp`. Simple examples introduce books, skills, everyday products and shared rides while keeping product details for launch.

The headline is **Your campus. Your next big thing.** Email-only signup appears immediately, with early access, an early member badge and referral priority as reasons to join. The launch team must fulfil these perks. No signup total, live queue position or fixed launch date is displayed.

## Build and preview

Requires Node.js 18+; no dependency installation is needed. From the repository root:

```sh
node site/build.mjs
node site/serve.mjs
```

Open `http://127.0.0.1:4173/`. Set `PORT` to change the preview port. The preview server sends an `X-Robots-Tag: noindex` header. The complete `site/dist/` directory is the deployment output; local edits and builds do not publish anything.

For Vercel, use the repository root as the dashboard root directory. The existing `vercel.json` supplies `node site/build.mjs` and the `site/dist` output directory. There is no package installation step. Rebuild after changing source files or configuration.

## Editing

- `config.mjs`: canonical domain, shared search/social metadata, SplitForms endpoint and public form access key.
- `src/index.html`: copy, semantic markup, email form, success state, sharing controls and disclosures.
- `src/style.css`: responsive layout, campus visuals, focus states and reduced-motion support.
- `src/app.js`: enhanced signup, referral capture, success sharing, signup links and optional prepare-only WebMCP support.
- `assets/`: local fonts, campus illustration, favicon and 1200 × 630 social card, copied into the deployment output.
- `referrals.mjs`: private, offline operator tool for ranking accepted signup exports. It is not a backend and is not copied into the public site.

The build rejects invalid domain configuration and unresolved template placeholders. Edit source files, then rebuild `site/dist/`.

## Signup and sharing

The form asks for one email address. It retains the configured SplitForms endpoint at `https://splitforms.com/api/submit` and the existing public form access key. Native form submission remains available without JavaScript. Enhanced submission displays success only after the provider returns `success: true`; it retains the entered email after failure and handles invalid email, repeated clicks, a spam trap, rate limits and a 20-second timeout.

After confirmed signup, the student receives a personal invite URL and sharing controls. An incoming `ref` query parameter is submitted as `referred_by`; the student's new random code is submitted as `referral_code`. Codes contain 12–40 letters, digits, underscores or hyphens. The same fields also appear as separate lines in `message`, so a provider export that preserves only the message can still support ranking:

```text
referral_code: 0123456789abcdef0123456789abcdef
referred_by: abcdef0123456789abcdef0123456789
```

An empty `referred_by` means no invite was used. Codes contain no email address. A code is kept for retrying the same submission and replaced when starting another signup. There is no live rank service, analytics, cookie identifier or browser storage of subscriber emails. Students should save their invite link; the static page cannot recover it after a reload. Without JavaScript, email signup works but personal referral sharing is unavailable.

Referral priority is fulfilled by the launch team using accepted submissions and the ranking tool below. It is not applied automatically inside SplitForms. Before publication, verify the configured form key and production-domain settings, and submit an address you control to confirm delivery and preservation of the referral fields or message. Set up the reply/unsubscribe process described in the privacy copy before sending subscriber emails. The optional WebMCP tool prepares form values for review; it cannot submit the form.

Live signup delivery and inbox receipt have not been tested in this update. Automated verification uses simulated provider responses and sends no subscriber data.

## Honour referral priority at launch

1. Export **successfully accepted submissions only** from SplitForms. Keep subscriber exports and ranked lists outside this repository and outside `site/dist/`.
2. Review the export for fake, bot or otherwise ineligible signups. Successful form submission does **not** establish email ownership, and this page does not implement email verification. Remove disqualified records before generating the final ranking.
3. Supply a UTF-8 CSV with column headers or a JSON array of flat records. Supported fields are `email`, `referral_code`, `referred_by`, `message`, `submitted_at` and `created_at`. If the export uses other names or nested objects, map these fields first. Use ISO timestamps with an explicit timezone, such as `2026-09-29T08:00:00+05:00` or `2026-09-29T03:00:00Z`.
4. Run the tool with explicit input and output paths. The output path must be a new file; existing files are never overwritten.

```sh
node site/referrals.mjs --input /private/accepted-signups.csv --output /private/ranked-waitlist.csv
```

On Windows, quote the actual private paths, for example `--input "C:\Private\accepted-signups.csv" --output "C:\Private\ranked-waitlist.csv"`. These are placeholders; the tool does not create directories or upload data.

5. Invite students in the resulting rank order, and fulfil the advertised early-crew perks. Repeat the export, review and ranking process when preparing another access wave. The ranking is an operational list, not a student-facing live position.

Ranking rules:

- Email addresses are trimmed and compared case-insensitively. A distinct email contributes at most one referral; repeated submissions cannot inflate totals or change its original referrer.
- The earliest accepted signup determines referral attribution. Valid timestamps are ordered first; records without a usable timestamp follow in their original export order. Ties use export order. Keep a consistent export order when timestamps are unavailable.
- Multiple codes submitted for the same email are aliases for one student. The earliest accepted claim of each code owns it; a later conflicting claim does not steal ownership or earn credit. Review the accepted export and its timestamps before inviting students.
- A referral qualifies when its code belongs to one other accepted, unique signup. Self-referrals, unknown codes, malformed codes and contradictory direct/message fields earn no credit. A signup with no referral code still stays on the waitlist.
- More qualifying referrals means higher priority; ties go to the earliest signup. This counts distinct accepted addresses, not confirmed humans. Manual review is necessary for launch eligibility.
- Rows without a usable email and unsupported row shapes are ignored. Explicit unsuccessful `success` values and common failed, pending, rejected or spam statuses are also ignored; this filtering does not replace exporting only accepted submissions.
- Output columns are `rank`, `email`, `referral_code`, `qualified_referrals`, `joined_at` and `source_row` (the 1-based data-record position, excluding a CSV header). Formula-like cells are prefixed with an apostrophe to prevent spreadsheet formula execution. Standard output contains aggregate counts only, never subscriber emails.

## Search and sharing

Production targets `https://unimarkaz.com/`. The initial HTML includes one H1, Pakistan-focused title and description, `en-PK` language, canonical URL, linked Organization/WebSite/WebPage structured data, and Open Graph and Twitter/X previews. The sitemap contains the canonical homepage; invite query strings point to that same canonical page. The build also produces `robots.txt` with the sitemap location.

Build indexing behavior:

- A configured `SITE.domain` and an unset or `production` `VERCEL_ENV` produce indexable production HTML.
- `VERCEL_ENV=preview` or any other non-production value produces `noindex` HTML, an empty sitemap and no sitemap entry in `robots.txt`. An empty `SITE.domain` also disables indexing and omits canonical/social image URLs.
- The local preview server always sends `X-Robots-Tag: noindex`, including when serving a production build.

`vercel.json` sets permanent redirects from `www.unimarkaz.com` to the apex domain and from `/index.html` to `/`. It adds `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` headers, plus one-day browser caching for assets. These hosting rules apply on Vercel; the local server does not emulate them.

At launch:

1. Attach `unimarkaz.com` and `www.unimarkaz.com` to the Vercel project, configure the DNS records Vercel supplies and confirm HTTPS is ready. Deploy a fresh **production** build so preview `noindex` metadata is replaced.
2. Check that `https://unimarkaz.com/`, `/robots.txt` and `/sitemap.xml` return successfully; the homepage allows indexing, uses the correct canonical, and has no `noindex` response header. Verify HTTP, www and `/index.html` redirects on the live host, including an invite query string.
3. In [Google Search Console](https://search.google.com/search-console), add the **Domain** property `unimarkaz.com`. Add its supplied verification TXT record at the DNS provider, then complete verification.
4. Open **Sitemaps**, submit `https://unimarkaz.com/sitemap.xml` and check for processing errors. See [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
5. Use **URL Inspection** for `https://unimarkaz.com/`, run **Test live URL**, inspect the rendered result, then **Request indexing** when it passes. Monitor indexing and search performance after launch. See [Google's indexing request guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

Search Console verification and submission require domain/account access and remain launch tasks. Indexing, rich results and first-place rankings are not guaranteed; see [Google's SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

## Verification

```sh
node site/build.mjs
node site/verify.cjs
node --test site/referrals.test.mjs
```

The dependency-free page checks validate generated metadata, assets and form behavior without sending a real signup. Referral tests cover deduplication, alias and ownership conflicts, self referrals, attribution, timestamps, message fallback, malformed exports, spreadsheet escaping and private CLI output. These checks do not render CSS; inspect the page in desktop and mobile browsers as well.

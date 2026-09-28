# UniMarkaz — coming soon

A complete, responsive student marketplace anticipation page with original blue/lime branding, animated campus cards, local fonts, and a compact email waitlist.

## Run and deploy

Requires Node.js; no dependency installation.

```sh
node build.mjs
node serve.mjs
```

Preview at http://127.0.0.1:4173. Deploy `dist` to your HTTPS static host for **unimarkaz.com**. The custom domain is configured in metadata; this does not configure DNS or publish the site.

## Configuration

- `config.mjs`: the single `REGISTERED_USERS = 100` variable controls the hardcoded mock counter. It never fetches real signups or increments after a submission.
- `config.mjs`: final domain, title, description, and public SplitForms form key. Never use an account API token in frontend code. Confirm that the supplied key is active and its allowed-domain settings include unimarkaz.com.
- `src/index.html`: all copy and markup. Product scope includes tutoring, project collaboration, bike pooling, skills, services and other campus connections, across universities. No payments or transactions are handled.
- `dist/style.css`: responsive styling, animation, motion pause, reduced-motion preferences, keyboard focus and forced-colors support.
- `dist/app.js`: email submission, input validation, duplicate-submit prevention, timeout, retry and rate-limit messages. Success appears only after the backend confirms `success: true`. Comments identify an optional analytics hook; no analytics, cookies, local storage or personal-data logging are installed.

The form only asks for an email and one interest: offering, looking, or both. Launch-email purpose is stated alongside the form. Set up your unsubscribe/reply handling before sending launch emails. Development checks use mocked responses and do not send real signup emails. Confirm delivery with your own test email before public launch.

## SEO and performance

The build outputs semantic static HTML, canonical and Open Graph URLs for https://unimarkaz.com/, searchable title and description, WebSite JSON-LD, a robots file and sitemap. It uses descriptive campus-marketplace copy, one H1, native FAQ disclosures, a local variable font with its OFL license, a compressed 68 KB WebP with reserved dimensions, and deferred JavaScript. No framework runtime or external font requests. Configure compression and caching on the host and submit the sitemap to Search Console after deployment.

The campus image is generated illustrative imagery, not a testimonial. Social preview artwork is omitted until requested. No launch date, false scarcity, campus partnerships or guaranteed services are claimed. Features may evolve.

References: [Google search guidance](https://developers.google.com/search/docs/fundamentals/get-started-developers), [WebSite structured data](https://developers.google.com/search/docs/appearance/site-names), [SplitForms integration](https://splitforms.com/docs).

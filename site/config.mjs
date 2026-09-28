// Manually maintained display count. Update this when the verified total changes.
// This value is not fetched from the form provider or incremented by the browser.
export const REGISTERED_USERS = 100;

export const SITE = {
  // Set to your final HTTPS origin (no trailing slash), then run `node build.mjs`.
  // Empty keeps previews out of search results and omits placeholder canonical URLs.
  domain: 'https://unimarkaz.com',
  title: 'UniMarkaz — Earn While You Study | Pakistan Student Marketplace',
  description: 'Turn your university skills into earning opportunities. UniMarkaz connects students across Pakistan for tutoring, design, coding and more. Join the free waitlist.',
  formEndpoint: 'https://splitforms.com/api/submit',
  // Public form access key, NOT a private SplitForms account API token.
  formAccessKey: '595c0ba446d040d2918c813f7505407d',
};

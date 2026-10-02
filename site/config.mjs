// Manually maintained display count. Update this when the verified total changes.
// This value is not fetched from the form provider or incremented by the browser.
export const REGISTERED_USERS = 100;

export const SITE = {
  // Set to your final HTTPS origin (no trailing slash), then run `node build.mjs`.
  // Empty keeps previews out of search results and omits placeholder canonical URLs.
  domain: 'https://unimarkaz.com',
  title: 'unimarkaz — Your Campus. Your Next Big Thing.',
  description: 'A place for students in Pakistan to buy, sell and find what they need. Sign up for free to get an invite before unimarkaz opens to everyone.',
  formEndpoint: 'https://splitforms.com/api/submit',
  // Public form access key, NOT a private SplitForms account API token.
  formAccessKey: '595c0ba446d040d2918c813f7505407d',
};

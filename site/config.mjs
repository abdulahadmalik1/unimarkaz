// The only source for the displayed count. This is a mock, never a live signup count.
export const REGISTERED_USERS = 100;

export const SITE = {
  // Set to your final HTTPS origin (no trailing slash), then run `node build.mjs`.
  // Empty keeps previews out of search results and omits placeholder canonical URLs.
  domain: 'https://unimarkaz.com',
  title: 'UniMarkaz — Your University Student Marketplace | Coming Soon',
  description: 'Tutoring, projects, bike pooling, skills and more. UniMarkaz connects university students to offer, find and collaborate across campuses. Join the launch waitlist.',
  formEndpoint: 'https://splitforms.com/api/submit',
  // Public form access key, NOT a private SplitForms account API token.
  formAccessKey: '595c0ba446d040d2918c813f7505407d',
};

'use strict';

const form = document.querySelector('#waitlist-form');
const status = document.querySelector('#form-status');
const success = document.querySelector('#success');
const submitButton = form.querySelector('button[type="submit"]');
const emailInput = form.elements.email;
const submitLabel = submitButton.firstElementChild;
const defaultSubmitLabel = submitLabel.textContent;
const waitlist = document.querySelector('#waitlist');
const signupIntro = document.querySelector('#signup-intro');
const referralLink = document.querySelector('#referral-link');
const copyLink = document.querySelector('#copy-link');
const shareWhatsapp = document.querySelector('#share-whatsapp');
const nativeShare = document.querySelector('#native-share');
const shareStatus = document.querySelector('#share-status');
const referralNote = document.querySelector('#referral-note');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let submitting = false;
let confirmedShareUrl = '';

// Codes contain no email or personal information. They are sent to the form
// provider so confirmed signups can be matched to the person who invited them.
const validReferralCode = value => typeof value === 'string' && /^[A-Za-z0-9_-]{12,40}$/.test(value);
const incomingCode = new URLSearchParams(location.search).get('ref');
const referredBy = validReferralCode(incomingCode) ? incomingCode : '';
function createReferralCode() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '');
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  // Signup still works in an older browser without secure random generation.
  return '';
}
let referralCode = createReferralCode();

function setReferralFields() {
  form.elements.referral_code.value = referralCode;
  form.elements.referred_by.value = referredBy === referralCode ? '' : referredBy;
}
setReferralFields();
if (referralNote) referralNote.hidden = !form.elements.referred_by.value;

form.elements.form_loaded_at.value = String(Date.now());

function revealShareOptions() {
  const canonical = document.querySelector('link[rel="canonical"]');
  const url = new URL(canonical?.href || location.origin);
  url.search = '';
  url.hash = '';
  if (referralCode) url.searchParams.set('ref', referralCode);
  confirmedShareUrl = url.href;
  if (referralLink) referralLink.value = confirmedShareUrl;
  if (copyLink) copyLink.querySelector('span').textContent = 'Copy link';
  if (shareStatus) shareStatus.textContent = '';
  if (shareWhatsapp) {
    shareWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(`unimarkaz is a place for students to buy, sell and find what they need. It’s launching soon. Join the list: ${confirmedShareUrl}`)}`;
  }
  if (nativeShare) nativeShare.hidden = typeof navigator.share !== 'function';
  if (shareStatus && !referralCode) {
    shareStatus.textContent = 'You can share this page. To get your own invite link, sign up using a newer browser.';
  }
}

copyLink?.addEventListener('click', async () => {
  if (!confirmedShareUrl) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(confirmedShareUrl);
    copyLink.querySelector('span').textContent = 'Copied!';
    if (shareStatus) shareStatus.textContent = 'Link copied. Share it with your friends.';
  } catch {
    referralLink?.focus();
    referralLink?.select();
    if (shareStatus) shareStatus.textContent = 'Your link is selected. Press and hold it, or use Ctrl+C / ⌘C to copy.';
  }
});

nativeShare?.addEventListener('click', async () => {
  if (!confirmedShareUrl || typeof navigator.share !== 'function') return;
  if (shareStatus) shareStatus.textContent = '';
  try {
    await navigator.share({
      title: 'unimarkaz — a marketplace for students',
      text: 'A place for students to buy, sell and find what they need is coming soon. Join the list with me.',
      url: confirmedShareUrl
    });
  } catch (error) {
    if (error.name !== 'AbortError' && shareStatus) shareStatus.textContent = 'Couldn’t open sharing. You can copy your invite link instead.';
  }
});

function selectInterest(interest) {
  if (!['offer', 'find', 'both'].includes(interest)) throw new Error('Invalid interest');
  form.elements.interest.value = interest;
}

// Every signup link leads straight to the next useful action, including on mobile.
document.querySelectorAll('a[href="#waitlist"]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!waitlist) return;
    event.preventDefault();
    if (!form.hidden && !submitting && ['offer', 'find', 'both'].includes(link.dataset.intent)) {
      selectInterest(link.dataset.intent);
    }
    waitlist.scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center'});
    if (form.hidden) success.focus({preventScroll: true});
    else form.elements.email.focus({preventScroll: true});
  });
});

// Open the disclosure when following a privacy link so its answer is immediately visible.
document.querySelectorAll('a[href="#privacy"]').forEach(link => {
  link.addEventListener('click', () => {
    const privacy = document.querySelector('#privacy');
    if (privacy) privacy.open = true;
  });
});

const motionToggle = document.querySelector('#motion-toggle');
if (motionToggle) {
  // Motion is already disabled in CSS for this preference; no inactive control is needed.
  motionToggle.hidden = reducedMotion.matches;
  motionToggle.addEventListener('click', () => {
    const paused = document.body.classList.toggle('motion-paused');
    motionToggle.setAttribute('aria-pressed', String(paused));
    motionToggle.setAttribute('aria-label', paused ? 'Resume card animation' : 'Pause card animation');
    motionToggle.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
  });
}

// Keep the mobile invitation out of the way when a signup invitation is already in view.
const mobileCta = document.querySelector('.mobile-cta');
let waitlistVisible = true;
let finalCallVisible = false;
function updateMobileCta() {
  if (mobileCta) mobileCta.hidden = waitlistVisible || finalCallVisible || !success.hidden;
}
if (mobileCta && waitlist && typeof IntersectionObserver !== 'undefined') {
  const finalCall = document.querySelector('#final-call');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target === waitlist) waitlistVisible = entry.isIntersecting;
      if (entry.target === finalCall) finalCallVisible = entry.isIntersecting;
    });
    updateMobileCta();
  }, {threshold: 0});
  observer.observe(waitlist);
  if (finalCall) observer.observe(finalCall);
}

function clearStatus() {
  if (!submitting) status.textContent = '';
}
form.addEventListener('input', clearStatus);
form.addEventListener('change', clearStatus);

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || form.hidden || form.elements.botcheck.value) return;
  // Pasted email addresses often include whitespace. Normalize before native validation.
  form.elements.email.value = form.elements.email.value.trim();
  if (!form.reportValidity()) return;
  // Keep the displayed email aligned with the request while it is in flight.
  // Read-only inputs remain part of FormData and can still be selected or copied.
  const emailWasReadOnly = emailInput.readOnly;
  emailInput.readOnly = true;
  submitting = true;
  submitButton.disabled = true;
  submitLabel.textContent = 'Joining…';
  form.setAttribute('aria-busy', 'true');
  status.textContent = '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const data = new FormData(form);
    data.set('email', form.elements.email.value);
    // Plain-text copies keep referral attribution available in email/CSV exports
    // even if the form provider does not expose extra fields as separate columns.
    data.set('referral_code', referralCode);
    data.set('referred_by', form.elements.referred_by.value);
    data.set('message', `unimarkaz early-access waitlist. Interest: ${data.get('interest')}. Requested early access and launch email updates.\nreferral_code: ${referralCode}\nreferred_by: ${form.elements.referred_by.value}`);
    const response = await fetch(form.action, {
      method: 'POST', body: data, headers: {Accept: 'application/json'}, signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true) {
      const error = new Error('Signup not confirmed');
      error.rateLimited = response.status === 429;
      throw error;
    }
    form.hidden = true;
    if (signupIntro) signupIntro.hidden = true;
    if (referralNote) referralNote.hidden = true;
    success.hidden = false;
    revealShareOptions();
    updateMobileCta();
    success.focus({preventScroll: true});
    // No signup details or referral codes are stored in this browser.
  } catch (error) {
    status.textContent = error.name === 'AbortError'
      ? 'We couldn’t confirm your signup in time. Please try again. You don’t need to re-enter your email.'
      : error.rateLimited
        ? 'Please wait a minute, then try again. You don’t need to re-enter your email.'
        : 'We couldn’t confirm your signup. Please try again. You don’t need to re-enter your email.';
    status.focus({preventScroll: true});
  } finally {
    clearTimeout(timeout);
    submitting = false;
    emailInput.readOnly = emailWasReadOnly;
    submitButton.disabled = false;
    submitLabel.textContent = defaultSubmitLabel;
    form.removeAttribute('aria-busy');
  }
});

document.querySelector('#another-signup')?.addEventListener('click', () => {
  if (submitting) return;
  form.reset();
  referralCode = createReferralCode();
  setReferralFields();
  confirmedShareUrl = '';
  form.elements.form_loaded_at.value = String(Date.now());
  status.textContent = '';
  success.hidden = true;
  form.hidden = false;
  if (signupIntro) signupIntro.hidden = false;
  if (referralNote) referralNote.hidden = !form.elements.referred_by.value;
  updateMobileCta();
  form.elements.email.focus({preventScroll: true});
});

// Progressive WebMCP enhancement: prepare only; never submit automatically.
if (document.modelContext?.registerTool) {
  const lifetime = new AbortController();
  const tool = {
    name: 'prepare_unimarkaz_waitlist',
    title: 'Prepare UniMarkaz waitlist signup',
    description: 'Prepare an email and interest for a UniMarkaz waitlist signup. Interest is a hidden form value. Does not submit the form or sign anyone up.',
    inputSchema: {type: 'object', properties: {interest: {type: 'string', enum: ['offer', 'find', 'both']}, email: {type: 'string', maxLength: 254}}, required: ['interest'], additionalProperties: false},
    annotations: {readOnlyHint: false, untrustedContentHint: false},
    execute(input) {
      if (!input || !['offer', 'find', 'both'].includes(input.interest) || Object.keys(input).some(key => !['interest', 'email'].includes(key))) throw new Error('Invalid signup details');
      if (input.email !== undefined && (typeof input.email !== 'string' || input.email.length > 254)) throw new Error('Invalid email');
      if (submitting || form.hidden) throw new Error('The form is not available for editing');
      selectInterest(input.interest);
      if (input.email !== undefined) form.elements.email.value = input.email.trim();
      clearStatus();
      waitlist?.scrollIntoView({block: 'center'});
      form.elements.email.focus({preventScroll: true});
      return {status: 'prepared', submitted: false};
    }
  };
  try { Promise.resolve(document.modelContext.registerTool(tool, {signal: lifetime.signal})).catch(() => {}); } catch {}
  addEventListener('pagehide', event => { if (!event.persisted) lifetime.abort(); }, {once: true});
}

'use strict';
const form = document.querySelector('#waitlist-form');
const status = document.querySelector('#form-status');
const success = document.querySelector('#success');
const submitButton = form.querySelector('button[type="submit"]');
let submitting = false;
form.elements.form_loaded_at.value = String(Date.now());
function selectInterest(interest) {
  if (!['offer', 'find', 'both'].includes(interest)) throw new Error('Invalid interest');
  form.elements.interest.value = interest;
}
document.querySelectorAll('[data-intent]').forEach(link => link.addEventListener('click', () => selectInterest(link.dataset.intent)));
// Fixed mock count from config.mjs, never fetched or incremented on signups.
const counter = document.querySelector('[data-count]');
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const target = Number(counter.dataset.count), start = performance.now();
  const animate = now => {
    const progress = Math.min((now - start) / 1100, 1);
    counter.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
    if (progress < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}
const motionToggle = document.querySelector('#motion-toggle');
motionToggle.addEventListener('click', () => {
  const paused = document.body.classList.toggle('motion-paused');
  motionToggle.setAttribute('aria-pressed', String(paused));
  motionToggle.setAttribute('aria-label', paused ? 'Resume card animation' : 'Pause card animation');
  motionToggle.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || !form.reportValidity() || form.elements.botcheck.value) return;
  submitting = true;
  submitButton.disabled = true;
  submitButton.firstElementChild.textContent = 'Joining…';
  form.setAttribute('aria-busy', 'true');
  status.textContent = '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const data = new FormData(form);
    data.set('email', form.elements.email.value.trim());
    data.set('message', `UniMarkaz beta waitlist. Interest: ${data.get('interest')}. Requested beta testing opportunities and launch email updates.`);
    const response = await fetch(form.action, {method:'POST',body:data,headers:{Accept:'application/json'},signal:controller.signal});
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true) {
      const error = new Error('Signup not confirmed');
      error.rateLimited = response.status === 429;
      throw error;
    }
    form.hidden = true;
    success.hidden = false;
    success.focus({preventScroll:true});
    // ANALYTICS: add a consent-aware waitlist_success event here if desired.
    // Never include emails or personal data. No analytics is installed.
  } catch (error) {
    status.textContent = error.name === 'AbortError'
      ? 'We couldn’t confirm your signup in time. Please try again shortly.'
      : error.rateLimited
        ? 'Please wait a minute, then try again. Your email is still here.'
        : 'We couldn’t confirm your signup. Your email is still here—please try again.';
    status.focus({preventScroll:true});
  } finally {
    clearTimeout(timeout);
    submitting = false;
    submitButton.disabled = false;
    submitButton.firstElementChild.textContent = 'Join beta waitlist';
    form.removeAttribute('aria-busy');
  }
});
document.querySelector('#another-signup').addEventListener('click', () => {
  form.reset();
  form.elements.form_loaded_at.value = String(Date.now());
  status.textContent = '';
  success.hidden = true;
  form.hidden = false;
  form.elements.email.focus();
});
// Progressive WebMCP enhancement: prepare only; never submit automatically.
if (document.modelContext?.registerTool) {
  const lifetime = new AbortController();
  const tool = {
    name:'prepare_unimarkaz_waitlist',
    title:'Prepare UniMarkaz waitlist signup',
    description:'Select an interest and fill the email field for review. Does not submit the form or sign anyone up.',
    inputSchema:{type:'object',properties:{interest:{type:'string',enum:['offer','find','both']},email:{type:'string',maxLength:254}},required:['interest'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input) {
      if (!input || !['offer','find','both'].includes(input.interest) || Object.keys(input).some(key => !['interest','email'].includes(key))) throw new Error('Invalid signup details');
      if (input.email !== undefined && (typeof input.email !== 'string' || input.email.length > 254)) throw new Error('Invalid email');
      if (submitting || form.hidden) throw new Error('The form is not available for editing');
      selectInterest(input.interest);
      if (input.email !== undefined) form.elements.email.value = input.email;
      document.querySelector('#waitlist').scrollIntoView();
      return {status:'prepared',submitted:false};
    }
  };
  try { Promise.resolve(document.modelContext.registerTool(tool,{signal:lifetime.signal})).catch(() => {}); } catch {}
  addEventListener('pagehide', event => { if (!event.persisted) lifetime.abort(); }, {once:true});
}

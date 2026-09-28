'use strict';

const form = document.querySelector('#waitlist-form');
const status = document.querySelector('#form-status');
const success = document.querySelector('#success');
const submitButton = form.querySelector('button[type="submit"]');
const submitLabel = submitButton.firstElementChild;
const defaultSubmitLabel = submitLabel.textContent;
const waitlist = document.querySelector('#waitlist');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let submitting = false;

form.elements.form_loaded_at.value = String(Date.now());

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

// The displayed count comes from config.mjs. It is never fetched or incremented on signup.
const counter = document.querySelector('[data-count]');
if (counter && !reducedMotion.matches) {
  const target = Number(counter.dataset.count);
  if (Number.isFinite(target) && target >= 0) {
    const start = performance.now();
    const animate = now => {
      const progress = Math.min(Math.max((now - start) / 1100, 0), 1);
      counter.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
}

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

const skills = {
  tutoring: {
    icon: 'Aa', tag: 'KNOW IT. TEACH IT.', title: 'Explain it once. Earn from it.',
    description: 'The subject you’ve got down could be the one someone else is stuck on. Offer tutoring around your own timetable.',
    examples: 'Subject tutoring · Exam prep · Study sessions'
  },
  design: {
    icon: '✳', tag: 'CREATE IT. PUT IT OUT THERE.', title: 'Your creative streak has a market.',
    description: 'From society posters to a new venture’s identity, students have ideas that need a creative eye. Yours could be just the one.',
    examples: 'Posters · Presentations · Club branding'
  },
  code: {
    icon: '</>', tag: 'BUILD IT. MAKE IT USEFUL.', title: 'Build beyond your coursework.',
    description: 'Turn your technical know-how into something useful. Build a simple site or help another student understand the code.',
    examples: 'Simple websites · Coding lessons · Portfolio help'
  },
  photo: {
    icon: '◎', tag: 'FRAME IT. SHARE YOUR TALENT.', title: 'Your lens. A campus side gig.',
    description: 'Graduation days, society events, a student’s new venture. Help people capture the moments and ideas that matter to them.',
    examples: 'Graduation portraits · Society events · Product photos'
  }
};

const skillPreview = document.querySelector('#skill-preview');
const skillButtons = document.querySelectorAll('[data-skill]');
skillButtons.forEach(button => {
  button.addEventListener('click', () => {
    const category = button.dataset.skill;
    if (!Object.hasOwn(skills, category) || !skillPreview) return;
    const skill = skills[category];
    skillButtons.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
    for (const key of ['icon', 'tag', 'title', 'description', 'examples']) {
      const element = document.querySelector('#skill-' + key);
      if (element) element.textContent = skill[key];
    }
    skillPreview.dataset.category = category;
  });
});

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
    data.set('message', `UniMarkaz beta waitlist. Interest: ${data.get('interest')}. Requested beta testing opportunities and launch email updates.`);
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
    success.hidden = false;
    updateMobileCta();
    success.focus({preventScroll: true});
    // No analytics or personal information is stored in this browser.
  } catch (error) {
    status.textContent = error.name === 'AbortError'
      ? 'We couldn’t confirm your signup in time. Your email is still here — please try again shortly.'
      : error.rateLimited
        ? 'Please wait a minute, then try again. Your email is still here.'
        : 'We couldn’t confirm your signup. Your email is still here — please try again.';
    status.focus({preventScroll: true});
  } finally {
    clearTimeout(timeout);
    submitting = false;
    submitButton.disabled = false;
    submitLabel.textContent = defaultSubmitLabel;
    form.removeAttribute('aria-busy');
  }
});

document.querySelector('#another-signup')?.addEventListener('click', () => {
  if (submitting) return;
  form.reset();
  form.elements.form_loaded_at.value = String(Date.now());
  status.textContent = '';
  success.hidden = true;
  form.hidden = false;
  updateMobileCta();
  form.elements.email.focus({preventScroll: true});
});

// Progressive WebMCP enhancement: prepare only; never submit automatically.
if (document.modelContext?.registerTool) {
  const lifetime = new AbortController();
  const tool = {
    name: 'prepare_unimarkaz_waitlist',
    title: 'Prepare UniMarkaz waitlist signup',
    description: 'Select an interest and fill the email field for review. Does not submit the form or sign anyone up.',
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

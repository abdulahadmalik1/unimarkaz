const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

// Entirely offline: the application runs with fake elements and fake requests.
const dist = path.join(__dirname, 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(dist, 'app.js'), 'utf8');
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
const metas = [...html.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => attrs(tag));
const meta = key => metas.find(item => item.name === key || item.property === key)?.content;

function verifyOutput(SITE, REGISTERED_USERS) {
  assert.equal((html.match(/<h1\b/g) || []).length, 1, 'One primary heading');
  assert(!/\{\{\w+\}\}/.test(html), 'All build tokens resolve');
  assert.equal(decode(html.match(/<title>(.*?)<\/title>/s)[1]), SITE.title);
  assert.equal(meta('description'), SITE.description);
  assert(meta('robots').includes('index, follow'));
  const canonical = [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => attrs(tag)).find(item => item.rel === 'canonical');
  assert.equal(canonical.href, `${SITE.domain}/`);
  assert.equal(meta('og:url'), canonical.href);
  assert.equal(meta('og:type'), 'website');
  for (const key of ['og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:card']) assert(meta(key), `Missing ${key}`);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(([, json]) => {
    const schema = JSON.parse(json); return schema['@graph'] || (Array.isArray(schema) ? schema : [schema]);
  });
  const website = schemas.find(schema => schema['@type'] === 'WebSite');
  assert(website, 'WebSite structured data is present');
  assert.equal(website.url, canonical.href);
  assert.match(website.name, /^unimarkaz$/i);
  assert(fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8').includes(canonical.href));
  assert(fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8').includes(`Sitemap: ${SITE.domain}/sitemap.xml`));
  const checkAsset = value => {
    const url = new URL(value, SITE.domain);
    if (url.origin !== SITE.domain || url.pathname === '/') return;
    assert(fs.existsSync(path.join(dist, decodeURIComponent(url.pathname))), `Missing asset ${url.pathname}`);
  };
  for (const [, value] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) if (!/^(?:data:|mailto:|tel:)/.test(value)) checkAsset(decode(value));
  checkAsset(meta('og:image')); checkAsset(meta('twitter:image'));
  for (const [, value] of fs.readFileSync(path.join(dist, 'style.css'), 'utf8').matchAll(/url\(["']?([^\s)'";]+)["']?\)/g)) if (!value.startsWith('data:')) checkAsset(value);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, 'Unique element IDs');
  for (const [, target] of html.matchAll(/href="#([^" ]+)"/g)) assert(ids.includes(target), `Missing anchor ${target}`);
  assert(!html.includes('name="name"') && !html.includes('name="campus"'), 'Compact signup');
  const signup = attrs(html.match(/<form\b[^>]*id="waitlist-form"[^>]*>/)[0]);
  assert.equal(signup.action, SITE.formEndpoint);
  assert.equal(signup.method.toLowerCase(), 'post', 'Native form remains usable without JavaScript');
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => attrs(tag));
  const interestInputs = inputs.filter(input => input.name === 'interest');
  assert.equal(interestInputs.length, 1, 'One interest value accompanies the email');
  assert.equal(interestInputs[0].type, 'hidden', 'Signup needs only an email');
  assert.equal(interestInputs[0].value, 'both', 'Marketplace is the default interest');
  assert(!inputs.some(input => input.type === 'radio'), 'No interest-choice step');
  const email = inputs.find(input => input.name === 'email');
  assert.equal(email?.type, 'email');
  assert.equal(email.id, 'email');
  assert.equal(email.autocomplete, 'email');
  assert.equal(inputs.find(input => input.name === 'access_key')?.value, SITE.formAccessKey);
  for (const name of ['referral_code', 'referred_by', 'form_loaded_at', 'subject']) {
    assert.equal(inputs.find(input => input.name === name)?.type, 'hidden', `${name} is sent without adding form friction`);
  }
  for (const id of ['waitlist-form', 'form-status', 'success', 'waitlist', 'another-signup', 'referral-link', 'copy-link', 'share-whatsapp', 'native-share', 'share-status']) {
    assert(ids.includes(id), `Missing application hook #${id}`);
  }
  assert(/<input\b[^>]*id="referral-link"[^>]*\breadonly\b/.test(html), 'Invite link is readable and selectable');
  assert(/<[^>]*id="success"[^>]*\bhidden\b/.test(html), 'No success state before confirmation');
  assert(/<[^>]*id="share-status"[^>]*aria-live="polite"/.test(html), 'Share feedback is announced');
  assert(!/localStorage|sessionStorage/.test(js), 'Signup details are not saved in browser storage');
  const counts = [...html.matchAll(/data-count="(\d+)"[^>]*>(\d+)</g)];
  assert.equal(counts.length, 1, 'One prominent count');
  assert.equal(Number(counts[0][1]), REGISTERED_USERS);
  assert.equal(Number(counts[0][2]), REGISTERED_USERS, 'Configured count is visible in initial HTML');
  assert.equal(REGISTERED_USERS, 100, 'Preserve requested count');
}

class Element {
  constructor(properties = {}) {
    Object.assign(this, {hidden:false,textContent:'',dataset:{},attributes:{},handlers:{},classes:new Set()});
    this.classList = {
      toggle: (name, force) => { const active = force === undefined ? !this.classes.has(name) : force; if (active) this.classes.add(name); else this.classes.delete(name); return active; },
      contains: name => this.classes.has(name), add: (...names) => names.forEach(name => this.classes.add(name)), remove: (...names) => names.forEach(name => this.classes.delete(name)),
    };
    Object.assign(this, properties);
  }
  addEventListener(event, handler) { this.handlers[event] = handler; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  scrollIntoView() { this.scrolled = true; }
  getBoundingClientRect() { return {top:100,bottom:500,height:400}; }
  dispatch(event, detail = {}) { return this.handlers[event]?.({preventDefault(){},currentTarget:this,target:this,...detail}); }
}

function createHarness(SITE, REGISTERED_USERS, options = {}) {
  const defaultLabel = decode(html.match(/<button\b[^>]*type="submit"[^>]*>\s*<[^>]+>([^<]+)/)[1]);
  const button = new Element({disabled:false,firstElementChild:new Element({textContent:defaultLabel})});
  const status = new Element(), success = new Element({hidden:true});
  const counter = new Element({textContent:String(REGISTERED_USERS),dataset:{count:String(REGISTERED_USERS)}});
  const form = new Element({valid:true,action:SITE.formEndpoint,elements:{form_loaded_at:{value:''},botcheck:{value:''},email:new Element({value:'test@example.com'}),interest:new Element({type:'hidden',value:'both'}),referral_code:new Element({value:''}),referred_by:new Element({value:''})},querySelector:() => button,reportValidity(){return this.valid;},reset(){this.elements.email.value='';this.elements.botcheck.value='';this.elements.interest.value='both';this.elements.referral_code.value='';this.elements.referred_by.value='';}});
  const signupLinks = [...html.matchAll(/<a\b[^>]*href="#waitlist"[^>]*>/g)].map(([tag]) => {
    const intent = attrs(tag)['data-intent'];
    return new Element({dataset:intent ? {intent} : {}});
  });
  const motion = new Element({firstElementChild:new Element({textContent:'Ⅱ'})});
  const another = new Element(), waitlist = new Element(), mobile = new Element({hidden:true}), body = new Element(), privacyLink = new Element();
  const copyLabel = new Element({textContent:'Copy link'}), copy = new Element({querySelector:() => copyLabel});
  const referralLink = new Element({value:''}), whatsapp = new Element({href:'#'}), share = new Element({hidden:true}), shareStatus = new Element();
  const selectors = {'#waitlist-form':form,'#form-status':status,'#success':success,'[data-count]':counter,'#motion-toggle':motion,'#another-signup':another,'#waitlist':waitlist,'.mobile-cta':mobile,'#final-call':new Element(),'#privacy':new Element({open:false}),'#signup-intro':new Element(),'#referral-link':referralLink,'#copy-link':copy,'#share-whatsapp':whatsapp,'#native-share':share,'#share-status':shareStatus,'#referral-note':new Element(),'link[rel="canonical"]':options.noCanonical ? null : new Element({href:SITE.domain + '/'})};
  const globalHandlers = {}, timers = new Map(), observations = [], requests = [], clipboardWrites = [], shares = [];
  let nextTimer = 0, nextCode = 0, mode = 'success', finish, registeredTool;
  class MockData extends Map {constructor(){super([...Object.entries(form.elements).map(([key, value]) => [key,value.value]),['access_key',SITE.formAccessKey]]);}}
  class MockIntersectionObserver {constructor(callback, options){this.callback=callback;this.options=options;observations.push(this);}observe(element){(this.elements ||= []).push(element);}unobserve(){}disconnect(){}}
  const reducedMotion = {matches:!!options.prefersReducedMotion,addEventListener(){},removeEventListener(){}};
  const navigator = {
    clipboard:options.noClipboard ? undefined : {writeText:async value => {if(options.clipboardFailure) throw new Error('Not allowed');clipboardWrites.push(value);}},
    share:options.noNativeShare ? undefined : async value => {if(options.shareError) {const error=new Error('Sharing failed');error.name=options.shareError;throw error;}shares.push(value);},
  };
  const crypto = options.noCrypto ? undefined : {
    randomUUID:options.fallbackCrypto ? undefined : () => `00000000-0000-4000-8000-${String(++nextCode).padStart(12,'0')}`,
    getRandomValues:array => {for(let index=0;index<array.length;index++) array[index]=index;return array;},
  };
  const context = {
    document:{body,documentElement:new Element(),querySelector:selector => selectors[selector] ?? null,querySelectorAll:selector => selector === 'a[href="#waitlist"]' ? signupLinks : selector === 'a[href="#privacy"]' ? [privacyLink] : [],modelContext:{registerTool(tool){registeredTool=tool;}}},
    matchMedia:() => reducedMotion,addEventListener:(event,callback) => {globalHandlers[event]=callback;},
    Date,Number,String,Error,TypeError,Object,Promise,FormData:MockData,AbortController,URL,URLSearchParams,Uint8Array,crypto,navigator,
    location:{search:options.search || '',origin:'https://preview.example.test'},
    performance:{now:() => 0},requestAnimationFrame:callback => callback(1100),IntersectionObserver:MockIntersectionObserver,
    setTimeout(callback){const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id => timers.delete(id),
    fetch:async(url,options) => {
      assert.equal(url,SITE.formEndpoint);assert.equal(options.method,'POST');assert.equal(options.headers.Accept,'application/json');requests.push(options);
      if(mode === 'pending') await new Promise(resolve => {finish=resolve;});
      if(mode === 'timeout') await new Promise((resolve,reject) => options.signal.addEventListener('abort',() => {const error=new Error('Timed out');error.name='AbortError';reject(error);},{once:true}));
      if(mode === 'network') throw new TypeError('Failed to fetch');
      return {ok:!['rate','server'].includes(mode),status:mode === 'rate' ? 429 : mode === 'server' ? 500 : 200,json:async() => {
        if(mode === 'malformed') throw new SyntaxError('Invalid JSON');
        if(mode === 'null') return null;
        if(mode === 'rejected') return {success:false};
        if(mode === 'ambiguous') return {success:'true'};
        return {success:true};
      }};
    },
  };
  context.window=context;
  vm.runInNewContext(js,context,{filename:'app.js'});
  return {form,button,defaultLabel,status,success,counter,signupLinks,motion,another,waitlist,mobile,privacyLink,selectors,body,requests,timers,observations,globalHandlers,referralLink,copy,copyLabel,whatsapp,share,shareStatus,clipboardWrites,shares,get registeredTool(){return registeredTool;},setMode:value => {mode=value;},finish:() => finish(),submit:() => form.dispatch('submit'),expire:() => [...timers.values()].forEach(callback => callback())};
}

async function verifyBehavior(SITE, REGISTERED_USERS) {
  const incoming='friend_invite_0123456789';
  const app=createHarness(SITE,REGISTERED_USERS,{search:`?ref=${incoming}&unrelated=discarded`}), {form,button,status,success,counter}=app;
  assert(Number(form.elements.form_loaded_at.value)>0);assert.equal(form.elements.interest.value,'both');
  const ownCode=form.elements.referral_code.value;
  assert.match(ownCode,/^[a-f0-9]{32}$/);assert.equal(form.elements.referred_by.value,incoming);
  assert(!app.selectors['#referral-note'].hidden,'Valid invitation shows a welcome message');
  assert(!form.hidden && success.hidden,'No success is restored before a confirmed request');
  await app.copy.dispatch('click');await app.share.dispatch('click');
  assert.equal(app.clipboardWrites.length,0);assert.equal(app.shares.length,0,'Sharing needs a confirmed signup');
  assert(app.signupLinks.length > 0);
  for(const link of app.signupLinks){const previousInterest=form.elements.interest.value;link.dispatch('click');assert.equal(form.elements.interest.value,link.dataset.intent || previousInterest);}
  assert(form.elements.email.focused && app.waitlist.scrolled, 'Signup links reach and focus the form');
  app.privacyLink.dispatch('click');assert(app.selectors['#privacy'].open, 'Privacy link opens its answer');
  const observer = app.observations.find(item => item.elements.includes(app.waitlist));
  assert(observer, 'Sticky invitation observes the form');
  assert(app.mobile.hidden);
  observer.callback([{target:app.waitlist,isIntersecting:false}]);assert(!app.mobile.hidden);
  observer.callback([{target:app.selectors['#final-call'],isIntersecting:true}]);assert(app.mobile.hidden);
  observer.callback([{target:app.selectors['#final-call'],isIntersecting:false}]);assert(!app.mobile.hidden);
  form.elements.interest.value='both';form.valid=false;await app.submit();assert.equal(app.requests.length,0,'Invalid forms do not submit');
  form.valid=true;form.elements.botcheck.value='automated filler';await app.submit();assert.equal(app.requests.length,0,'Honeypot is ignored');form.elements.botcheck.value='';
  for(const mode of ['rate','network','server','rejected','ambiguous','null','malformed']) {
    app.setMode(mode);await app.submit();
    assert(!form.hidden && success.hidden,`${mode}: stay on form`);assert.equal(form.elements.email.value,'test@example.com',`${mode}: preserve email`);
    assert.equal(app.referralLink.value,'',`${mode}: do not create a confirmed invite link`);
    assert.equal(form.elements.referral_code.value,ownCode,`${mode}: retries retain attribution`);
    assert(!app.selectors['#signup-intro'].hidden,`${mode}: form introduction remains available`);
    assert(status.textContent.length>0,`${mode}: explain failure`);if(mode === 'rate') assert(status.textContent.includes('wait a minute'));
    assert(!button.disabled,`${mode}: permit retry`);assert.equal(button.firstElementChild.textContent,app.defaultLabel);
    assert.equal(form.getAttribute('aria-busy'),null);assert.equal(app.timers.size,0,`${mode}: clear timer`);
    form.dispatch('input');assert.equal(status.textContent,'','Editing clears stale errors');
  }
  app.setMode('timeout');const timedOut=app.submit();app.expire();await timedOut;
  assert(!form.hidden && success.hidden);assert(status.textContent.includes('in time'));assert(!button.disabled);
  app.setMode('pending');form.elements.email.value='  student@example.com  ';form.elements.interest.value='both';const pending=app.submit();
  assert(button.disabled);assert.equal(form.getAttribute('aria-busy'),'true');const before=app.requests.length;await app.submit();assert.equal(app.requests.length,before,'Prevent duplicates');
  assert.throws(() => app.registeredTool.execute({interest:'offer'}),/not available/);app.finish();await pending;
  assert(form.hidden && !success.hidden,'Confirmed response succeeds');assert(success.focused);assert.equal(counter.textContent,String(REGISTERED_USERS),'Count is unchanged by signup');
  assert(app.mobile.hidden, 'Confirmed signup hides the sticky invitation');
  const callsAfterSuccess=app.requests.length;await app.submit();assert.equal(app.requests.length,callsAfterSuccess,'Hidden form cannot resubmit');
  const payload=app.requests.at(-1).body;assert.equal(payload.get('email'),'student@example.com');assert.equal(payload.get('interest'),'both');assert.equal(payload.get('access_key'),SITE.formAccessKey);assert(payload.get('message').includes('launch'));
  assert.equal(payload.get('referral_code'),ownCode);assert.equal(payload.get('referred_by'),incoming);
  assert(payload.get('message').includes(`\nreferral_code: ${ownCode}\nreferred_by: ${incoming}`),'Email exports preserve both attribution fields');
  const invite=new URL(app.referralLink.value);assert.equal(invite.origin,SITE.domain);assert.equal(invite.searchParams.get('ref'),ownCode);assert.equal([...invite.searchParams].length,1,'No email or other query is shared');
  assert(!invite.href.includes('student'));assert(app.selectors['#signup-intro'].hidden);assert(app.selectors['#referral-note'].hidden,'Hide signup introductions after confirmation');
  const whatsapp=new URL(app.whatsapp.href);assert.equal(whatsapp.origin,'https://wa.me');assert(whatsapp.searchParams.get('text').includes(invite.href));
  await app.copy.dispatch('click');assert.deepEqual(app.clipboardWrites,[invite.href]);assert.equal(app.copyLabel.textContent,'Copied!');assert(app.shareStatus.textContent.includes('copied'));
  await app.share.dispatch('click');assert.equal(app.shares.length,1);assert.equal(app.shares[0].url,invite.href);
  assert.equal(app.requests.length,callsAfterSuccess,'Sharing never makes a request or registers a referral');assert.equal(counter.textContent,String(REGISTERED_USERS),'Sharing does not invent momentum');
  app.another.dispatch('click');assert(!form.hidden && success.hidden);assert.equal(form.elements.email.value,'');assert.equal(form.elements.interest.value,'both');assert(form.elements.email.focused);
  assert.notEqual(form.elements.referral_code.value,ownCode,'A different signup gets a different own code');assert.equal(form.elements.referred_by.value,incoming,'Reset keeps the original invitation');assert(!app.selectors['#signup-intro'].hidden);assert(!app.selectors['#referral-note'].hidden);
  assert(!app.mobile.hidden, 'Reset restores the appropriate invitation state');
  const beforePrepare=app.requests.length;assert(app.registeredTool);const prepared=app.registeredTool.execute({interest:'find',email:'another@example.com'});
  assert.equal(prepared.submitted,false);assert.equal(form.elements.email.value,'another@example.com');assert.equal(form.elements.interest.value,'find');assert.equal(app.requests.length,beforePrepare,'Preparation never submits');
  assert.throws(() => app.registeredTool.execute({interest:'invalid'}),/Invalid/);assert.throws(() => app.registeredTool.execute({interest:'offer',email:123}),/Invalid/);assert.throws(() => app.registeredTool.execute({interest:'offer',unrelated:true}),/Invalid/);
  app.motion.dispatch('click');assert(app.body.classList.contains('motion-paused'));assert.equal(app.motion.getAttribute('aria-pressed'),'true');
  app.motion.dispatch('click');assert(!app.body.classList.contains('motion-paused'));assert.equal(app.motion.getAttribute('aria-pressed'),'false');
  const reduced=createHarness(SITE,REGISTERED_USERS,{prefersReducedMotion:true});assert(reduced.motion.hidden);assert.equal(reduced.counter.textContent,String(REGISTERED_USERS));

  for (const invalid of ['', 'short', 'x'.repeat(41), '<script>alert(1)</script>', 'friend@example.com', 'has spaces 123456', 'https://evil.test']) {
    const rejected=createHarness(SITE,REGISTERED_USERS,{search:`?ref=${encodeURIComponent(invalid)}`});
    assert.equal(rejected.form.elements.referred_by.value,'',`Reject unsafe code ${invalid}`);
    assert(rejected.selectors['#referral-note'].hidden,'Invalid invitation does not show a welcome message');
    await rejected.submit();assert.equal(rejected.requests[0].body.get('referred_by'),'');
  }
  for (const valid of ['a'.repeat(12), 'Z'.repeat(40), 'abc_DEF-0123456']) {
    const accepted=createHarness(SITE,REGISTERED_USERS,{search:`?ref=${valid}`});assert.equal(accepted.form.elements.referred_by.value,valid);
  }
  for (const options of [{noClipboard:true}, {clipboardFailure:true}]) {
    const fallback=createHarness(SITE,REGISTERED_USERS,options);await fallback.submit();await fallback.copy.dispatch('click');
    assert(fallback.referralLink.focused && fallback.referralLink.selected,'Copy fallback selects the visible link');assert(fallback.shareStatus.textContent.includes('copy'));assert.equal(fallback.copyLabel.textContent,'Copy link','Never falsely report copied');
  }
  const noShare=createHarness(SITE,REGISTERED_USERS,{noNativeShare:true});await noShare.submit();assert(noShare.share.hidden,'Hide unsupported native share');assert(noShare.whatsapp.href.startsWith('https://wa.me/'));
  const cancelled=createHarness(SITE,REGISTERED_USERS,{shareError:'AbortError'});await cancelled.submit();await cancelled.share.dispatch('click');assert.equal(cancelled.shareStatus.textContent,'','Cancellation is quiet');
  const shareError=createHarness(SITE,REGISTERED_USERS,{shareError:'NotAllowedError'});await shareError.submit();await shareError.share.dispatch('click');assert(shareError.shareStatus.textContent.includes('copy'));
  const noCanonical=createHarness(SITE,REGISTERED_USERS,{noCanonical:true});await noCanonical.submit();assert.equal(new URL(noCanonical.referralLink.value).origin,'https://preview.example.test');
  const fallbackCrypto=createHarness(SITE,REGISTERED_USERS,{fallbackCrypto:true});assert.match(fallbackCrypto.form.elements.referral_code.value,/^[a-f0-9]{32}$/);
  const noCrypto=createHarness(SITE,REGISTERED_USERS,{noCrypto:true});await noCrypto.submit();assert(!noCrypto.success.hidden,'Signup can succeed without random-code support');assert.equal(new URL(noCrypto.referralLink.value).search,'');assert(noCrypto.shareStatus.textContent.includes('newer browser'));
}

(async() => {
  const {SITE,REGISTERED_USERS}=await import(pathToFileURL(path.join(__dirname,'config.mjs')).href);
  verifyOutput(SITE,REGISTERED_USERS);await verifyBehavior(SITE,REGISTERED_USERS);
  console.log('PASS: SEO, structured data, social images, sitemap, assets, configured count, email-only DOM contract, validation, spam trap, all request errors, timeout, duplicate prevention, confirmed success/reset, referral attribution and sanitization, share URLs, clipboard/native share fallbacks, privacy, motion, and prepare-only signup. Entirely offline; no live submissions sent.');
})().catch(error => {console.error(error);process.exitCode=1;});

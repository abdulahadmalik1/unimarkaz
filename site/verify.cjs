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
  assert.equal(website.name, 'UniMarkaz');
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
  assert(/name="interest" value="offer" checked/.test(html), 'Earning is the default interest');
  assert(html.includes('name="interest" value="find"') && html.includes('name="interest" value="both"'));
  assert(html.includes(`data-count="${REGISTERED_USERS}">${REGISTERED_USERS}</span>`), 'Configured count is visible in initial HTML');
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
  scrollIntoView() { this.scrolled = true; }
  getBoundingClientRect() { return {top:100,bottom:500,height:400}; }
  dispatch(event, detail = {}) { return this.handlers[event]?.({preventDefault(){},currentTarget:this,target:this,...detail}); }
}

function createHarness(SITE, REGISTERED_USERS, prefersReducedMotion = false) {
  const button = new Element({disabled:false,firstElementChild:new Element({textContent:'Get early access'})});
  const status = new Element(), success = new Element({hidden:true});
  const counter = new Element({textContent:String(REGISTERED_USERS),dataset:{count:String(REGISTERED_USERS)}});
  const interests = ['offer','find','both'].map(value => new Element({value,checked:value === 'offer'}));
  const interestGroup = {};
  Object.defineProperty(interestGroup, 'value', {get:() => interests.find(item => item.checked)?.value || '',set:value => interests.forEach(item => {item.checked = item.value === value;})});
  const form = new Element({valid:true,action:SITE.formEndpoint,elements:{form_loaded_at:{value:''},botcheck:{value:''},email:new Element({value:'test@example.com'}),interest:interestGroup},querySelector:() => button,querySelectorAll:() => interests,reportValidity(){return this.valid;},reset(){this.elements.email.value='';this.elements.botcheck.value='';this.elements.interest.value='offer';}});
  const intentLinks = ['offer','find','both'].map(intent => new Element({dataset:{intent}}));
  const skillButtons = ['tutoring','design','code','photo'].map(skill => new Element({dataset:{skill},attributes:{'aria-pressed':String(skill === 'tutoring')}}));
  const preview = new Element({dataset:{category:'tutoring'}}), motion = new Element({firstElementChild:new Element({textContent:'Ⅱ'})});
  const another = new Element(), waitlist = new Element(), mobile = new Element({hidden:true}), body = new Element(), privacyLink = new Element();
  const selectors = {'#waitlist-form':form,'#form-status':status,'#success':success,'[data-count]':counter,'#motion-toggle':motion,'#another-signup':another,'#waitlist':waitlist,'#skill-preview':preview,'.mobile-cta':mobile,'#final-call':new Element(),'#privacy':new Element({open:false})};
  for (const id of ['skill-tag','skill-icon','skill-title','skill-description','skill-examples','skill-cta']) selectors[`#${id}`] = new Element();
  const globalHandlers = {}, timers = new Map(), observations = [], requests = [];
  let nextTimer = 0, mode = 'success', finish, registeredTool;
  class MockData extends Map {constructor(){super([['email',form.elements.email.value],['interest',form.elements.interest.value],['access_key',SITE.formAccessKey],['form_loaded_at',form.elements.form_loaded_at.value]]);}}
  class MockIntersectionObserver {constructor(callback, options){this.callback=callback;this.options=options;observations.push(this);}observe(element){(this.elements ||= []).push(element);}unobserve(){}disconnect(){}}
  const reducedMotion = {matches:prefersReducedMotion,addEventListener(){},removeEventListener(){}};
  const context = {
    document:{body,documentElement:new Element(),querySelector:selector => selectors[selector] ?? null,querySelectorAll:selector => ['[data-intent]','a[href="#waitlist"]'].includes(selector) ? intentLinks : selector === 'a[href="#privacy"]' ? [privacyLink] : ['[data-skill]','.skill-choice'].includes(selector) ? skillButtons : [],modelContext:{registerTool(tool){registeredTool=tool;}}},
    matchMedia:() => reducedMotion,addEventListener:(event,callback) => {globalHandlers[event]=callback;},
    Date,Number,String,Error,TypeError,Object,Promise,FormData:MockData,AbortController,
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
  return {form,button,status,success,counter,intentLinks,skillButtons,preview,motion,another,waitlist,mobile,privacyLink,selectors,body,requests,timers,observations,globalHandlers,get registeredTool(){return registeredTool;},setMode:value => {mode=value;},finish:() => finish(),submit:() => form.dispatch('submit'),expire:() => [...timers.values()].forEach(callback => callback())};
}

async function verifyBehavior(SITE, REGISTERED_USERS) {
  const app=createHarness(SITE,REGISTERED_USERS), {form,button,status,success,counter}=app;
  assert(Number(form.elements.form_loaded_at.value)>0);assert.equal(form.elements.interest.value,'offer');
  for(const link of app.intentLinks){link.dispatch('click');assert.equal(form.elements.interest.value,link.dataset.intent);}
  assert(form.elements.email.focused && app.waitlist.scrolled, 'Signup links reach and focus the form');
  app.privacyLink.dispatch('click');assert(app.selectors['#privacy'].open, 'Privacy link opens its answer');
  const observer = app.observations.find(item => item.elements.includes(app.waitlist));
  assert(observer, 'Sticky invitation observes the form');
  assert(app.mobile.hidden);
  observer.callback([{target:app.waitlist,isIntersecting:false}]);assert(!app.mobile.hidden);
  observer.callback([{target:app.selectors['#final-call'],isIntersecting:true}]);assert(app.mobile.hidden);
  observer.callback([{target:app.selectors['#final-call'],isIntersecting:false}]);assert(!app.mobile.hidden);
  form.elements.interest.value='offer';form.valid=false;await app.submit();assert.equal(app.requests.length,0,'Invalid forms do not submit');
  form.valid=true;form.elements.botcheck.value='automated filler';await app.submit();assert.equal(app.requests.length,0,'Honeypot is ignored');form.elements.botcheck.value='';
  for(const mode of ['rate','network','server','rejected','ambiguous','null','malformed']) {
    app.setMode(mode);await app.submit();
    assert(!form.hidden && success.hidden,`${mode}: stay on form`);assert.equal(form.elements.email.value,'test@example.com',`${mode}: preserve email`);
    assert(status.textContent.length>0,`${mode}: explain failure`);if(mode === 'rate') assert(status.textContent.includes('wait a minute'));
    assert(!button.disabled,`${mode}: permit retry`);assert.equal(button.firstElementChild.textContent,'Get early access');
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
  app.another.dispatch('click');assert(!form.hidden && success.hidden);assert.equal(form.elements.email.value,'');assert.equal(form.elements.interest.value,'offer');assert(form.elements.email.focused);
  assert(!app.mobile.hidden, 'Reset restores the appropriate invitation state');
  const beforePrepare=app.requests.length;assert(app.registeredTool);const prepared=app.registeredTool.execute({interest:'find',email:'another@example.com'});
  assert.equal(prepared.submitted,false);assert.equal(form.elements.email.value,'another@example.com');assert.equal(form.elements.interest.value,'find');assert.equal(app.requests.length,beforePrepare,'Preparation never submits');
  assert.throws(() => app.registeredTool.execute({interest:'invalid'}),/Invalid/);assert.throws(() => app.registeredTool.execute({interest:'offer',email:123}),/Invalid/);assert.throws(() => app.registeredTool.execute({interest:'offer',unrelated:true}),/Invalid/);
  app.motion.dispatch('click');assert(app.body.classList.contains('motion-paused'));assert.equal(app.motion.getAttribute('aria-pressed'),'true');
  app.motion.dispatch('click');assert(!app.body.classList.contains('motion-paused'));assert.equal(app.motion.getAttribute('aria-pressed'),'false');
  const reduced=createHarness(SITE,REGISTERED_USERS,true);assert(reduced.motion.hidden);assert.equal(reduced.counter.textContent,String(REGISTERED_USERS));
  for(const choice of app.skillButtons) {
    choice.dispatch('click');assert.equal(app.preview.dataset.category,choice.dataset.skill);assert.equal(choice.getAttribute('aria-pressed'),'true');assert.equal(app.skillButtons.filter(item => item.getAttribute('aria-pressed') === 'true').length,1);
    for(const id of ['skill-tag','skill-icon','skill-title','skill-description','skill-examples']) {const element=app.selectors[`#${id}`];assert(element.textContent || element.innerHTML,`${choice.dataset.skill}: populate ${id}`);}
  }
}

(async() => {
  const {SITE,REGISTERED_USERS}=await import(pathToFileURL(path.join(__dirname,'config.mjs')).href);
  verifyOutput(SITE,REGISTERED_USERS);await verifyBehavior(SITE,REGISTERED_USERS);
  console.log('PASS: SEO metadata, structured data, social images, sitemap, local assets, configured count, validation, spam trap, request errors, timeout, duplicate prevention, success/reset, interest choices, category explorer, motion toggle, and prepare-only signup. No live submissions sent.');
})().catch(error => {console.error(error);process.exitCode=1;});

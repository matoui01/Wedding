/* ============================================================================
   main.js — nav, scroll state, mobile menu, reveal-on-scroll, Tally loader
   ========================================================================== */

/* ---- RSVP / Tally -------------------------------------------------------- *
 * Paste the three PUBLISHED Tally embed URLs here (Brief §8, §11).
 * Until then a styled placeholder card is shown so the section reads cleanly. */
const TALLY = {
  it: "", // e.g. "https://tally.so/embed/XXXXXX?transparentBackground=1"
  fr: "",
  en: ""
};

/* ---- Contact email ------------------------------------------------------- *
 * Assembled from parts at runtime so the literal address isn't in page source
 * (deters naive email scrapers). Fills every <a class="mail"> link. */
const _MAIL = ['maxime.ilaria', 'gmail.com'];
window.fillEmails = function(){
  const addr = _MAIL[0] + String.fromCharCode(64) + _MAIL[1];
  document.querySelectorAll('a.mail').forEach(a=>{
    a.setAttribute('href', 'mailto:' + addr);
    if(a.hasAttribute('data-addr')) a.textContent = addr;
  });
};

window.swapRsvp = function(lang){
  const host = document.getElementById('rsvp-embed');
  if(!host) return;
  const url = TALLY[lang];
  if(url){
    host.innerHTML =
      `<iframe src="${url}" loading="lazy" width="100%" height="640" frameborder="0" title="RSVP"></iframe>`;
  } else {
    const msg = { it:"Il modulo RSVP sarà disponibile a breve.",
                  fr:"Le formulaire RSVP sera bientôt disponible.",
                  en:"The RSVP form will be available shortly." }[lang] || "";
    host.innerHTML =
      `<div class="rsvp__placeholder" style="border:1px dashed var(--salvia);
        border-radius:var(--radius); padding:2.5rem 1.5rem; text-align:center;
        color:var(--muted); background:color-mix(in srgb,var(--salvia-light) 22%,transparent)">
        ${msg}<br><span class="cap">Tally embed → js/main.js · TALLY[${lang}]</span></div>`;
  }
};

/* ---- Countdown to the wedding ------------------------------------------- *
 * Ticks down to the ceremony: 23 July 2027, 16:00 Italy time (CEST = UTC+2). */
function initCountdown(){
  const el = document.getElementById('countdown');
  if(!el) return;
  const target = new Date('2027-07-23T16:00:00+02:00').getTime();
  const out = {
    days:  el.querySelector('[data-cd="days"]'),
    hours: el.querySelector('[data-cd="hours"]'),
    mins:  el.querySelector('[data-cd="mins"]'),
    secs:  el.querySelector('[data-cd="secs"]')
  };
  const pad = (n)=> String(n).padStart(2,'0');
  function tick(){
    let diff = Math.max(0, target - Date.now());
    const d = Math.floor(diff / 86400000); diff -= d * 86400000;
    const h = Math.floor(diff / 3600000);  diff -= h * 3600000;
    const m = Math.floor(diff / 60000);     diff -= m * 60000;
    const s = Math.floor(diff / 1000);
    out.days.textContent  = d;
    out.hours.textContent = pad(h);
    out.mins.textContent  = pad(m);
    out.secs.textContent  = pad(s);
  }
  tick();
  setInterval(tick, 1000);
}

/* ---- RSVP form → Google Sheet ------------------------------------------- *
 * Posts each reply as a row to a Google Apps Script web app (which appends it
 * to the couple's own Sheet). Paste the deployed /exec URL below to switch it
 * on; until then (or on a network error) the form shows the email fallback. */
const RSVP_ENDPOINT = "https://script.google.com/macros/s/AKfycbwGLM7CTpPteqaobfBmSC92beayqswEtDUgoM-Ze75RqoE1_Kw6Mw-4J4QwBlnOdhu1RA/exec";

/* ---- Guest token --------------------------------------------------------- *
 * Each invite email links to .../Wedding/?g=<token>. We stash that token and
 * post it back with the RSVP, which is how the couple's sheet knows which
 * guest replied without anyone having to type their name twice. It is kept in
 * localStorage so it survives a language switch or a return visit, and wiped
 * from the address bar so a shared screenshot doesn't carry someone's token. */
function guestToken(){
  let t = '';
  try{ t = new URLSearchParams(location.search).get('g') || ''; }catch(_){}
  t = t.trim().slice(0, 32);
  if(t){
    try{ localStorage.setItem('mi_guest', t); }catch(_){}
    try{
      const u = new URL(location.href);
      u.searchParams.delete('g');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }catch(_){}
    return t;
  }
  try{ return localStorage.getItem('mi_guest') || ''; }catch(_){ return ''; }
}

/* ---- The guest's own reply-by date ---------------------------------------- *
 * Written in the language on screen: the same day reads "30 aprile 2027",
 * "30 avril 2027" or "30 April 2027". Called again after every language
 * switch, since the switch rewrites the general sentence back over it.
 *
 * Two places say this line — the RSVP section and the form in the modal —
 * and the dictionary rewrites both. So both are written back over here: a
 * guest who read their own date on the page and then opened the form to
 * find the general one would not know which date they were being held to. */
const MONTHS_I18N = {
  it:['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'],
  fr:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
  en:['January','February','March','April','May','June','July','August','September','October','November','December']
};
const REPLY_BY_LINE = {
  it:'Vi preghiamo di rispondere entro il ', fr:'Merci de répondre avant le ', en:'Kindly reply by '
};
function showReplyBy(){
  const els = document.querySelectorAll('[data-i18n="rsvp.by"]');
  const iso = window.__guestReplyBy;
  if(!els.length || (!iso && !window.__guestReplyByText)) return;
  const L = document.documentElement.lang || 'it';
  let date = window.__guestReplyByText;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if(m){
    const months = MONTHS_I18N[L] || MONTHS_I18N.it;
    date = Number(m[3]) + ' ' + months[Number(m[2]) - 1] + ' ' + m[1];
  }
  /* Built as nodes rather than markup: the date can come from the couple's
     own sheet, and the span is what paints it — see .rsvp-by__date. Without
     this the guest's own deadline would land as plain text while the general
     one, which comes from the dictionary, is marked up. A span belongs to one
     parent, so each line gets its own. */
  els.forEach(el => {
    el.textContent = REPLY_BY_LINE[L] || REPLY_BY_LINE.it;
    const span = document.createElement('span');
    span.className = 'rsvp-by__date';
    span.textContent = date;
    el.append(span, '.');
  });
}
window.showReplyBy = showReplyBy;

/* ---- Prefill from the invite link ---------------------------------------- *
 * The token identifies the guest, so the sheet can tell us who is arriving:
 * their name, the language they were written to in, and whether their
 * invitation actually included a plus-one. That lets the form ask the right
 * questions instead of every question.
 *
 * Strictly an enhancement — the endpoint returns no email, phone or address,
 * and any failure here leaves the form exactly as it behaves without a link. */
async function prefillFromToken(form, token, update){
  if(!RSVP_ENDPOINT) return;
  let g;
  try{
    const res = await fetch(RSVP_ENDPOINT + '?g=' + encodeURIComponent(token), { method:'GET' });
    g = await res.json();
  }catch(_){ return; }
  if(!g || !g.ok) return;

  /* their own language, unless they have already picked one themselves */
  try{
    if(!localStorage.getItem('lang') && g.lang) setLang(g.lang);
  }catch(_){}

  /* Everything the sheet already knows, filled in — and nothing else touched,
     so a guest who has started typing never has their words replaced. The
     couple's own guesses are offered as answers to confirm, not as facts:
     every one of them can be changed before sending. */
  const set = (sel, value) => {
    const el = form.querySelector(sel);
    if(el && !el.value && value) el.value = value;
  };
  set('#rsvp-name', g.household || g.invitee);
  set('#rsvp-email', g.email);

  /* their own deadline, not the general one: each circle was given its own,
     and the sheet knows which applies to them. Kept as a date rather than a
     sentence, so switching language re-words it instead of leaving half of it
     in the language they were written to. */
  if(g.replyByISO || g.replyBy){
    window.__guestReplyBy = g.replyByISO || '';
    window.__guestReplyByText = g.replyBy || '';
    showReplyBy();
  }

  /* Only guests whose invitation included one see the plus-one option — which
   * means the apologetic note explaining who may bring one can go away. */
  const plusOpt  = form.querySelector('input[data-party][value="plus"]');
  const plusNote = form.querySelector('.rsvp-note');
  const partyAsk = form.querySelector('[data-partyask]');
  if(g.plusOne && partyAsk) partyAsk.hidden = false;   // hidden for everyone else
  if(!g.plusOne){
    /* nothing to ask: their invitation is for them, and the note explaining
       who may bring someone would only rub it in */
    if(plusNote) plusNote.hidden = true;
  }else{
    /* they were invited with someone: the answer is offered already chosen,
       with the name in it, since that is what their invitation said */
    if(plusOpt && !form.querySelector('input[data-party]:checked')) plusOpt.checked = true;
    if(g.plusName) set('#rsvp-plusname', g.plusName);
    if(plusNote) plusNote.hidden = true;      // it explains who may bring one; they know
  }

  update();
}

function initRsvpForm(){
  const form = document.getElementById('rsvp-form');
  if(!form) return;
  /* setAttribute, not .value: the form is reset after a successful send, and a
     reset restores each field to its attribute value — so the token has to
     live there or a second reply from the same guest would arrive unlinked. */
  const tokenField = form.querySelector('#rsvp-token');
  const token = guestToken();
  if(tokenField) tokenField.setAttribute('value', token);
  const status = form.querySelector('.rsvp-form__status');
  const btn = form.querySelector('button[type=submit]');
  const L = ()=> document.documentElement.lang || 'it';
  const MSG = {
    sending:{ it:'Invio in corso…', fr:'Envoi en cours…', en:'Sending…' },
    ok:{ it:'Grazie! La vostra risposta è arrivata. ❤', fr:'Merci ! Votre réponse nous est bien parvenue. ❤', en:'Thank you! Your reply has reached us. ❤' },
    err:{ it:'Qualcosa è andato storto. Scriveteci a ', fr:'Une erreur s’est produite. Écrivez-nous à ', en:'Something went wrong. Please email us at ' }
  };

  /* dynamic fields: show/hide + toggle `required` based on answers */
  const coming   = form.querySelector('[data-coming]');
  const plusBox  = form.querySelector('[data-plusname]');
  const stayBox  = form.querySelector('[data-staying]');
  const val = (sel)=>{ const el = form.querySelector(sel + ':checked'); return el ? el.value : ''; };
  const req = (el, on)=>{ if(el){ on ? el.setAttribute('required','') : el.removeAttribute('required'); } };
  function update(){
    const yes = val('[data-attending]') === 'yes';
    coming.hidden = !yes;
    /* Phone is asked for but never demanded: a guest who would rather not
       leave a number should not be stopped from replying over it. */
    req(form.querySelector('#rsvp-address'), yes);
    const partyAsk = form.querySelector('[data-partyask]');
    req(form.querySelector('input[name="party"]'), yes && partyAsk && !partyAsk.hidden);
    req(form.querySelector('input[name="shuttle"]'), yes);
    const plus = yes && val('[data-party]') === 'plus';
    plusBox.hidden = !plus;
    req(plusBox.querySelector('input'), plus);
    stayBox.hidden = !(yes && val('[data-shuttle]') === 'yes');
  }
  form.addEventListener('change', update);
  update();

  if(token) prefillFromToken(form, token, update);

  const showErr = ()=>{
    const addr = 'maxime.ilaria' + String.fromCharCode(64) + 'gmail.com';
    status.hidden = false; status.className = 'rsvp-form__status is-err';
    status.innerHTML = (MSG.err[L()]||MSG.err.en) + `<a class="mail" href="mailto:${addr}">${addr}</a>`;
  };
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!form.reportValidity()) return;
    if(!RSVP_ENDPOINT){ showErr(); return; }
    btn.disabled = true;
    status.hidden = false; status.className = 'rsvp-form__status'; status.textContent = MSG.sending[L()]||MSG.sending.en;
    const data = new URLSearchParams(new FormData(form));
    data.append('lang', L());
    try{
      await fetch(RSVP_ENDPOINT, { method:'POST', mode:'no-cors', body:data });
      status.className = 'rsvp-form__status is-ok'; status.textContent = MSG.ok[L()]||MSG.ok.en;
      form.reset(); update();
    }catch(_){ showErr(); }
    finally{ btn.disabled = false; }
  });
}

/* ---- RSVP modal --------------------------------------------------------- */
function initRsvpModal(){
  const modal = document.getElementById('rsvp-modal');
  const openBtn = document.getElementById('rsvp-open');
  if(!modal || !openBtn) return;
  let lastFocus = null;
  const open = ()=>{
    lastFocus = document.activeElement;
    modal.hidden = false; document.body.style.overflow = 'hidden';
    const f = modal.querySelector('input, textarea, button'); if(f) f.focus();
  };
  const close = ()=>{
    modal.hidden = true; document.body.style.overflow = '';
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  };
  openBtn.addEventListener('click', open);
  modal.querySelectorAll('[data-close]').forEach(el=> el.addEventListener('click', close));
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !modal.hidden) close(); });
}

/* ---- Password gate ------------------------------------------------------- *
 * Client-side only: a deterrent for casual visitors, not real security.
 * The page is locked by default (html.locked); a correct password removes the
 * lock and is remembered in localStorage. We compare a SHA-256 hash so the
 * literal password isn't sitting in the source. */
const GATE_HASH = "ad806aa20a169b98ea34767f96f2324836adbbd5bee74b2290bd694b2d3fd9e1";

async function sha256hex(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ---- Hero video ---------------------------------------------------------- *
 * Start the cinematic villa video only once the page is visible (after the
 * gate) and never under reduced-motion — the poster (last frame) then stands
 * in as a still hero. Muted + playsinline so mobile browsers allow playback. */
function playHero(){
  const v = document.querySelector('.hero__video');
  if(!v) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const p = v.play();
  if(p && p.catch) p.catch(()=>{ /* autoplay blocked → poster stays */ });
}

function initGate(){
  const gate = document.getElementById('gate');
  if(!gate){ playHero(); return; }
  const unlock = ()=>{
    try{ localStorage.setItem('mi_gate','1'); }catch(e){}
    document.documentElement.classList.remove('locked');
    gate.remove();
    document.body.style.overflow = '';
    playHero();
  };
  if(!document.documentElement.classList.contains('locked')){ gate.remove(); playHero(); return; }

  const form  = gate.querySelector('form');
  const input = gate.querySelector('input');
  const err   = gate.querySelector('.gate__error');
  document.body.style.overflow = 'hidden';
  setTimeout(()=> input && input.focus(), 60);

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    let ok = false;
    try{ ok = (await sha256hex(input.value.trim())) === GATE_HASH; }catch(_){ ok = false; }
    if(ok){ unlock(); return; }
    err.hidden = false;
    input.value = ''; input.focus();
    gate.classList.add('is-shake');
    setTimeout(()=> gate.classList.remove('is-shake'), 450);
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  /* password gate */
  initGate();

  /* language: detect → apply (also paints the RSVP embed) */
  setLang(detectLang());

  /* language buttons */
  document.querySelectorAll('.lang-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> setLang(btn.dataset.lang));
  });

  /* countdown */
  initCountdown();

  /* RSVP form + modal */
  initRsvpForm();
  initRsvpModal();

  /* copy-to-clipboard for gift details (IBAN, number, …) */
  const COPIED = { it:'Copiato', fr:'Copié', en:'Copied' };
  document.querySelectorAll('.copy[data-copy]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const val = btn.textContent.trim();
      try{ await navigator.clipboard.writeText(val); }catch(_){ /* clipboard unavailable */ }
      if(btn.dataset.orig === undefined) btn.dataset.orig = val;
      const lang = document.documentElement.lang || 'it';
      btn.textContent = COPIED[lang] || COPIED.en;
      btn.classList.add('is-copied');
      clearTimeout(btn._t);
      btn._t = setTimeout(()=>{ btn.textContent = btn.dataset.orig; btn.classList.remove('is-copied'); }, 1400);
    });
  });

  /* sticky top bar background on scroll */
  const bar = document.querySelector('.topbar');
  const onScroll = ()=> bar.classList.toggle('is-scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive:true });

  /* mobile menu */
  const burger = document.querySelector('.hamburger');
  const menu = document.querySelector('.mobile-menu');
  const toggleMenu = (open)=>{
    menu.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  if(burger && menu){
    burger.addEventListener('click', ()=> toggleMenu(!menu.classList.contains('is-open')));
    menu.querySelectorAll('a').forEach(a=> a.addEventListener('click', ()=> toggleMenu(false)));
  }

  /* reveal on scroll (respects reduced motion via CSS) */
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveals = document.querySelectorAll('.reveal');
  if(reduce || !('IntersectionObserver' in window)){
    reveals.forEach(el=> el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin:'0px 0px -10% 0px', threshold:0.08 });
    reveals.forEach(el=> io.observe(el));
  }
});

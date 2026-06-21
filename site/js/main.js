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

/* ---- RSVP form → Google Sheet ------------------------------------------- *
 * Posts each reply as a row to a Google Apps Script web app (which appends it
 * to the couple's own Sheet). Paste the deployed /exec URL below to switch it
 * on; until then (or on a network error) the form shows the email fallback. */
const RSVP_ENDPOINT = "https://script.google.com/macros/s/AKfycbwbRcRclZhOdY8DbNeaRSPZ0kK0cXAxMF9pIFEKtYDLwjKyx05Rklx461ifxUGk3gQK/exec";

function initRsvpForm(){
  const form = document.getElementById('rsvp-form');
  if(!form) return;
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
    req(form.querySelector('#rsvp-phone'), yes);
    req(form.querySelector('#rsvp-address'), yes);
    req(form.querySelector('input[name="party"]'), yes);
    req(form.querySelector('input[name="shuttle"]'), yes);
    const plus = yes && val('[data-party]') === 'plus';
    plusBox.hidden = !plus;
    req(plusBox.querySelector('input'), plus);
    stayBox.hidden = !(yes && val('[data-shuttle]') === 'yes');
  }
  form.addEventListener('change', update);
  update();

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

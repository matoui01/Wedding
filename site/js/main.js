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

function initGate(){
  const gate = document.getElementById('gate');
  if(!gate) return;
  const unlock = ()=>{
    try{ localStorage.setItem('mi_gate','1'); }catch(e){}
    document.documentElement.classList.remove('locked');
    gate.remove();
    document.body.style.overflow = '';
  };
  if(!document.documentElement.classList.contains('locked')){ gate.remove(); return; }

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

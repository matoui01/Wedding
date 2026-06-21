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

document.addEventListener('DOMContentLoaded', ()=>{
  /* language: detect → apply (also paints the RSVP embed) */
  setLang(detectLang());

  /* language buttons */
  document.querySelectorAll('.lang-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> setLang(btn.dataset.lang));
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

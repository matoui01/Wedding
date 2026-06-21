/* ============================================================================
   i18n.js — trilingual dictionary (IT default · FR · EN) + detection/switching
   Copy from Build Brief §7. [ ... ] markers = couple to fill (Brief §11).
   ========================================================================== */

const I18N = {
  it:{
    "meta.title":"Maxime & Ilaria — 23 luglio 2027, Firenze",
    "meta.desc":"Maxime & Ilaria si sposano il 23 luglio 2027 a Villa Corsini a Mezzomonte, Firenze. Programma, viaggio e RSVP.",
    "nav.story":"Storia","nav.day":"Il giorno","nav.venue":"La villa","nav.travel":"Soggiorno","nav.florence":"Firenze","nav.rsvp":"RSVP",

    "hero.over":"VILLA CORSINI A MEZZOMONTE · FIRENZE",
    "hero.tagline":"Ci sposiamo","hero.date":"Venerdì 23 luglio 2027","hero.place":"Firenze · Italia","hero.scroll":"Scorri",

    "welcome.over":"Benvenuti","welcome.title":"Insieme, in Toscana",
    "welcome.body":"Insieme alle nostre famiglie, abbiamo la gioia di invitarvi a celebrare il nostro matrimonio. Ci sposiamo tra le colline di Firenze, a Villa Corsini a Mezzomonte: una giornata di festa fra giardini, arte e buon vino, con le persone che amiamo.",

    "story.over":"La nostra storia","story.title":"Da [città] a Firenze",
    "story.body":"<em>[DA PERSONALIZZARE]</em> Come ci siamo incontrati, e come siamo arrivati fin qui… <em>(qualche riga vostra)</em>",

    "day.over":"Il giorno","day.title":"Il programma","day.note":"Gli orari saranno confermati.",
    "day.t1":"Arrivo & benvenuto","day.t2":"Cerimonia","day.t3":"Aperitivo nei giardini","day.t4":"Cena nella galleria affrescata","day.t5":"Si balla","day.t6":"Saluti","day.t6.time":"tardi",
    "day.dress.label":"Dress code","day.dress.value":"Black tie — abito lungo e smoking.","day.map.cap":"I giardini e la disposizione dei tavoli.",

    "venue.over":"Il luogo","venue.title":"Villa Corsini a Mezzomonte",
    "venue.body":"Una villa medicea del Quattrocento sulle colline a sud di Firenze, acquistata da Lorenzo il Magnifico nel 1480 e affrescata negli anni 1630 per il principe Giovan Carlo de' Medici. Dal 1644 è dei Corsini: giardini all'italiana, cipressi e oliveti affacciati sulle colline del Chianti.",
    "venue.quote":"«Le feste del Principe a Mezzomonte superavano in splendore quelle di corte.»",
    "venue.addr.label":"Indirizzo","venue.addr.value":"Villa Corsini a Mezzomonte, [via e CAP], Impruneta (FI), Italia",
    "venue.map.cta":"Apri in Google Maps","venue.getting":"A circa 25–30 minuti d'auto dal centro di Firenze.",

    "travel.over":"Soggiorno & viaggio","travel.title":"Come arrivare e dove dormire",
    "travel.air.h":"In aereo","travel.air.b":"Firenze (FLR) ~30 min · Pisa (PSA) ~1h20 · Bologna (BLQ) ~1h30.",
    "travel.train.h":"In treno","travel.train.b":"Firenze Santa Maria Novella (alta velocità da Roma, Milano, ecc.).",
    "travel.car.h":"Transfer","travel.car.b":"Auto o taxi dal centro, ~25–30 min. [Navetta: da confermare.]",
    "travel.stay.h":"Dove dormire","travel.stay.b":"<em>[DA AGGIUNGERE: 3–5 hotel — qualcuno in centro a Firenze, qualcuno vicino a Impruneta.]</em>",

    "flo.over":"Firenze","flo.title":"Cosa fare a Firenze",
    "flo.body":"Fatene un weekend. Salite sulla cupola del Duomo, perdetevi agli Uffizi, attraversate il Ponte Vecchio al tramonto e cercate il gelato migliore in Oltrarno. Le colline del Chianti e le loro vigne sono a pochi minuti a sud — e ne vale la pena.",

    "rsvp.over":"RSVP","rsvp.title":"Fateci sapere","rsvp.by":"Vi preghiamo di rispondere entro il [data].",
    "rsvp.fallback":"Problemi con il modulo? Scrivere a [email].",

    "foot.line":"Maxime & Ilaria · 23 luglio 2027 · Villa Corsini a Mezzomonte","foot.contact":"Domande? [email]","foot.close":"A presto",

    "alt.hero":"Acquerello di Villa Corsini a Mezzomonte","alt.estate":"Veduta della tenuta e dei giardini","alt.couple":"Gli sposi nel giardino","alt.plan":"Pianta dei giardini e dei tavoli","alt.venue":"Villa Corsini a Mezzomonte","alt.duomo":"Il Duomo di Firenze","alt.ponte":"Il Ponte Vecchio a Firenze"
  },

  fr:{
    "meta.title":"Maxime & Ilaria — 23 juillet 2027, Florence",
    "meta.desc":"Maxime & Ilaria se marient le 23 juillet 2027 à la Villa Corsini a Mezzomonte, Florence. Programme, voyage et RSVP.",
    "nav.story":"Histoire","nav.day":"Le jour","nav.venue":"Le lieu","nav.travel":"Séjour","nav.florence":"Florence","nav.rsvp":"RSVP",

    "hero.over":"VILLA CORSINI A MEZZOMONTE · FLORENCE",
    "hero.tagline":"Nous nous marions","hero.date":"Vendredi 23 juillet 2027","hero.place":"Florence · Italie","hero.scroll":"Défiler",

    "welcome.over":"Bienvenue","welcome.title":"Tous ensemble, en Toscane",
    "welcome.body":"Avec nos familles, nous avons la joie de vous inviter à célébrer notre mariage. Nous nous marions sur les collines de Florence, à la Villa Corsini a Mezzomonte : une journée de fête entre jardins, art et bon vin, avec ceux que nous aimons.",

    "story.over":"Notre histoire","story.title":"De [ville] à Florence",
    "story.body":"<em>[À PERSONNALISER]</em> Comment nous nous sommes rencontrés, et le chemin jusqu'ici… <em>(quelques lignes de vous)</em>",

    "day.over":"Le jour J","day.title":"Le déroulé","day.note":"Les horaires seront confirmés.",
    "day.t1":"Arrivée & accueil","day.t2":"Cérémonie","day.t3":"Cocktail dans les jardins","day.t4":"Dîner dans la galerie à fresques","day.t5":"Soirée dansante","day.t6":"Fin de soirée","day.t6.time":"tard",
    "day.dress.label":"Tenue","day.dress.value":"Black tie — robe longue et smoking.","day.map.cap":"Les jardins et le plan de table.",

    "venue.over":"Le lieu","venue.title":"Villa Corsini a Mezzomonte",
    "venue.body":"Une villa médicéenne du XVᵉ siècle sur les collines au sud de Florence, achetée par Laurent le Magnifique en 1480 et ornée de fresques dans les années 1630 pour le prince Giovan Carlo de' Medici. Aux Corsini depuis 1644 : jardins à l'italienne, cyprès et oliveraies dominant les collines du Chianti.",
    "venue.quote":"« Les fêtes du Prince à Mezzomonte surpassaient en splendeur celles de la cour. »",
    "venue.addr.label":"Adresse","venue.addr.value":"Villa Corsini a Mezzomonte, [rue et code postal], Impruneta (FI), Italie",
    "venue.map.cta":"Ouvrir dans Google Maps","venue.getting":"À environ 25–30 minutes en voiture du centre de Florence.",

    "travel.over":"Séjour & voyage","travel.title":"Venir & se loger",
    "travel.air.h":"En avion","travel.air.b":"Florence (FLR) ~30 min · Pise (PSA) ~1h20 · Bologne (BLQ) ~1h30.",
    "travel.train.h":"En train","travel.train.b":"Florence Santa Maria Novella (grande vitesse depuis Rome, Milan, etc.).",
    "travel.car.h":"Transfert","travel.car.b":"Voiture ou taxi depuis le centre, ~25–30 min. [Navette : à confirmer.]",
    "travel.stay.h":"Où dormir","travel.stay.b":"<em>[À AJOUTER : 3–5 hôtels — quelques-uns dans Florence, quelques-uns près d'Impruneta.]</em>",

    "flo.over":"Florence","flo.title":"Que faire à Florence",
    "flo.body":"Faites-en un week-end. Montez à la coupole du Duomo, flânez aux Offices, traversez le Ponte Vecchio au coucher du soleil et trouvez la meilleure glace de l'Oltrarno. Les collines du Chianti et leurs vignobles sont à quelques minutes au sud — et ça vaut le détour.",

    "rsvp.over":"RSVP","rsvp.title":"Répondez-nous","rsvp.by":"Merci de répondre avant le [date].",
    "rsvp.fallback":"Un souci avec le formulaire ? Écrivez à [email].",

    "foot.line":"Maxime & Ilaria · 23 juillet 2027 · Villa Corsini a Mezzomonte","foot.contact":"Questions ? [email]","foot.close":"À très bientôt",

    "alt.hero":"Aquarelle de la Villa Corsini a Mezzomonte","alt.estate":"Vue du domaine et des jardins","alt.couple":"Les mariés dans le jardin","alt.plan":"Plan des jardins et des tables","alt.venue":"Villa Corsini a Mezzomonte","alt.duomo":"Le Duomo de Florence","alt.ponte":"Le Ponte Vecchio à Florence"
  },

  en:{
    "meta.title":"Maxime & Ilaria — 23 July 2027, Florence",
    "meta.desc":"Maxime & Ilaria are getting married on 23 July 2027 at Villa Corsini a Mezzomonte, Florence. Programme, travel and RSVP.",
    "nav.story":"Story","nav.day":"The day","nav.venue":"Venue","nav.travel":"Travel","nav.florence":"Florence","nav.rsvp":"RSVP",

    "hero.over":"VILLA CORSINI A MEZZOMONTE · FLORENCE",
    "hero.tagline":"We're getting married","hero.date":"Friday, 23 July 2027","hero.place":"Florence · Italy","hero.scroll":"Scroll",

    "welcome.over":"Welcome","welcome.title":"Together, in Tuscany",
    "welcome.body":"Together with our families, we are delighted to invite you to celebrate our wedding. We're getting married in the hills of Florence, at Villa Corsini a Mezzomonte — a day of celebration among gardens, art and good wine, with the people we love.",

    "story.over":"Our story","story.title":"From [city] to Florence",
    "story.body":"<em>[TO PERSONALISE]</em> How we met, and how we got here… <em>(a few lines in your own words)</em>",

    "day.over":"The day","day.title":"The programme","day.note":"Times to be confirmed.",
    "day.t1":"Arrival & welcome","day.t2":"Ceremony","day.t3":"Aperitivo in the gardens","day.t4":"Dinner in the frescoed gallery","day.t5":"Dancing","day.t6":"Farewell","day.t6.time":"late",
    "day.dress.label":"Dress code","day.dress.value":"Black tie — floor-length gowns and black tie.","day.map.cap":"The gardens and the seating plan.",

    "venue.over":"The venue","venue.title":"Villa Corsini a Mezzomonte",
    "venue.body":"A fifteenth-century Medici villa in the hills south of Florence, bought by Lorenzo the Magnificent in 1480 and frescoed in the 1630s for Prince Giovan Carlo de' Medici. Held by the Corsini family since 1644 — formal box gardens, cypress and olive groves looking over the Chianti hills.",
    "venue.quote":"“The Prince's feasts at Mezzomonte outshone in splendour those of the court.”",
    "venue.addr.label":"Address","venue.addr.value":"Villa Corsini a Mezzomonte, [street & postcode], Impruneta (FI), Italy",
    "venue.map.cta":"Open in Google Maps","venue.getting":"About 25–30 minutes by car from central Florence.",

    "travel.over":"Stay & travel","travel.title":"Getting there & where to stay",
    "travel.air.h":"By air","travel.air.b":"Florence (FLR) ~30 min · Pisa (PSA) ~1h20 · Bologna (BLQ) ~1h30.",
    "travel.train.h":"By train","travel.train.b":"Florence Santa Maria Novella (high-speed from Rome, Milan, etc.).",
    "travel.car.h":"Getting to the villa","travel.car.b":"Car or taxi from the centre, ~25–30 min. [Shuttle: to be confirmed.]",
    "travel.stay.h":"Where to stay","travel.stay.b":"<em>[TO ADD: 3–5 hotels — a few in central Florence, a few near Impruneta.]</em>",

    "flo.over":"Florence","flo.title":"Things to do in Florence",
    "flo.body":"Make a weekend of it. Climb the Duomo, wander the Uffizi, cross the Ponte Vecchio at golden hour and hunt down the best gelato in the Oltrarno. The Chianti hills and their vineyards are a short drive south — and worth it.",

    "rsvp.over":"RSVP","rsvp.title":"Let us know","rsvp.by":"Kindly reply by [date].",
    "rsvp.fallback":"Trouble with the form? Email us at [email].",

    "foot.line":"Maxime & Ilaria · 23 July 2027 · Villa Corsini a Mezzomonte","foot.contact":"Questions? [email]","foot.close":"See you soon",

    "alt.hero":"Watercolour of Villa Corsini a Mezzomonte","alt.estate":"View of the estate and gardens","alt.couple":"The couple in the garden","alt.plan":"Plan of the gardens and tables","alt.venue":"Villa Corsini a Mezzomonte","alt.duomo":"The Florence Duomo","alt.ponte":"The Ponte Vecchio in Florence"
  }
};

/* Detect on first visit: saved choice → browser lang (it/fr) → English default. */
function detectLang(){
  const saved = localStorage.getItem('lang');
  if(saved && I18N[saved]) return saved;
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  if(nav.startsWith('it')) return 'it';
  if(nav.startsWith('fr')) return 'fr';
  return 'en';
}

/* Apply a language across text, translatable attributes, <html lang>, meta. */
function setLang(lang){
  if(!I18N[lang]) lang = 'en';
  const dict = I18N[lang];
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const v = dict[el.dataset.i18n];
    if(v != null) el.innerHTML = v;
  });
  // data-i18n-attr="alt:alt.hero, aria-label:nav.rsvp" etc.
  document.querySelectorAll('[data-i18n-attr]').forEach(el=>{
    el.dataset.i18nAttr.split(',').forEach(pair=>{
      const [attr,key] = pair.split(':').map(s=>s.trim());
      const v = dict[key];
      if(v != null) el.setAttribute(attr, v);
    });
  });

  if(dict['meta.title']) document.title = dict['meta.title'];
  const md = document.querySelector('meta[name="description"]');
  if(md && dict['meta.desc']) md.setAttribute('content', dict['meta.desc']);

  localStorage.setItem('lang', lang);
  if(typeof window.swapRsvp === 'function') window.swapRsvp(lang);

  document.querySelectorAll('.lang-btn').forEach(b=>{
    b.classList.toggle('is-active', b.dataset.lang === lang);
    b.setAttribute('aria-pressed', b.dataset.lang === lang);
  });
}

window.I18N = I18N;
window.detectLang = detectLang;
window.setLang = setLang;

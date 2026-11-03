/* Vonk - dagelijkse idee-scroller. Vanilla JS, geen build-stap.
   Gegevens op dit apparaat: localStorage 'vonk.v1'. Het GitHub-token voor sync
   staat alleen hier, nooit in de repo. */
'use strict';

const OPSLAG = 'vonk.v1';
const PIJLERS = { wetenschap: 'Wetenschap & tech', denken: 'Denken', geschiedenis: 'Geschiedenis & filosofie' };
const SOORT = { artikel: 'Artikel', paper: 'Paper', boek: 'Boek', video: 'Video', podcast: 'Podcast' };

/* ---------- toestand ---------- */
function laad() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(OPSLAG)) || {}; } catch (_) { s = {}; }
  return Object.assign({
    acties: {},      // id -> {like, bewaar, minder, sec, pijler, tags, datum}
    bewaard: {},     // id -> volledige kaart
    vuil: {},        // ids gewijzigd sinds laatste sync
    apparaat: 'tel-' + Math.random().toString(36).slice(2, 6),
    repo: 'astetic-dev/vonk',
    token: '',
    laatsteSync: 0,
    gelezenTot: {}   // datum -> laatste index gezien (hervatten)
  }, s);
}
let S = laad();
function bewaar() { try { localStorage.setItem(OPSLAG, JSON.stringify(S)); } catch (_) { /* privé-venster */ } }

/* ---------- hulpjes ---------- */
const $ = sel => document.querySelector(sel);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'tekst') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'data') Object.entries(v).forEach(([dk, dv]) => { n.dataset[dk] = dv; });
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
  return n;
}
let meldTimer;
function meld(t) {
  const m = $('#melding'); m.textContent = t; m.hidden = false;
  clearTimeout(meldTimer); meldTimer = setTimeout(() => { m.hidden = true; }, 2600);
}
function datumNL(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}
function veiligeUrl(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (_) { return null; } }

async function haalJson(pad) {
  const r = await fetch(pad, { cache: 'no-store' });
  if (!r.ok) throw new Error(pad + ': HTTP ' + r.status);
  return r.json();
}

/* ---------- interactie ---------- */
function actie(kaart) {
  if (!S.acties[kaart.id]) S.acties[kaart.id] = { like: false, bewaar: false, minder: false, sec: 0,
    pijler: kaart.pijler, tags: kaart.tags || [], datum: kaart.id.slice(0, 10) };
  return S.acties[kaart.id];
}
function wissel(kaart, soort, knop) {
  const a = actie(kaart);
  a[soort] = !a[soort];
  if (soort === 'like' && a.like) a.minder = false;
  if (soort === 'minder' && a.minder) { a.like = false; }
  if (soort === 'bewaar') { if (a.bewaar) S.bewaard[kaart.id] = kaart; else delete S.bewaard[kaart.id]; }
  S.vuil[kaart.id] = 1;
  bewaar();
  const vak = knop.closest('.kaart');
  vak.querySelector('[data-a=like]').classList.toggle('aan', a.like);
  vak.querySelector('[data-a=minder]').classList.toggle('aan', a.minder);
  vak.querySelector('[data-a=bewaar]').classList.toggle('aan', a.bewaar);
  if (soort === 'minder' && a.minder) meld('Minder van dit soort - wordt meegenomen bij de volgende feed');
}

/* leestijd: hoe lang een kaart (>=60%) in beeld is */
let zicht = null, zichtStart = 0, zichtKaart = null;
function stopZicht() {
  if (zichtKaart && zichtStart) {
    const sec = Math.min(300, Math.round((Date.now() - zichtStart) / 1000));
    if (sec >= 2) { const a = actie(zichtKaart); a.sec = Math.min(600, a.sec + sec); S.vuil[zichtKaart.id] = 1; bewaar(); }
  }
  zichtKaart = null; zichtStart = 0;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopZicht(); autoSync(); } });

/* ---------- kaart tekenen ---------- */
const GLYPH = { wetenschap: '⚛', denken: '◎', geschiedenis: '⌛' };
function kleurvlak(kaart) {
  return el('div', { class: 'beeld vlak' }, el('span', { tekst: GLYPH[kaart.pijler] || '✦' }));
}
function beeldKop(kaart, idx) {
  const b = kaart.beeld;
  const url = b && veiligeUrl(b.url);
  if (!url) return kleurvlak(kaart);
  const img = el('img', { src: url, alt: '', loading: idx < 2 ? 'eager' : 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  const kop = el('figure', { class: 'beeld' }, img,
    el('figcaption', {}, veiligeUrl(b.pagina) ? el('a', { href: veiligeUrl(b.pagina), target: '_blank', rel: 'noopener', tekst: b.credit || '' }) : (b.credit || '')));
  img.addEventListener('error', () => kop.replaceWith(kleurvlak(kaart)));   // hotlink geweigerd of offline
  return kop;
}
function kaartVak(kaart, idx, totaal) {
  const a = S.acties[kaart.id] || {};
  const url = veiligeUrl(kaart.bron && kaart.bron.url);
  const alinea = String(kaart.tekst || '').split(/\n{2,}/).map(t => el('p', { tekst: t }));
  const vak = el('section', { class: 'kaart-vak' },
    el('article', { class: 'kaart', data: { pijler: kaart.pijler } },
      beeldKop(kaart, idx),
      el('div', { class: 'label' },
        el('span', { tekst: PIJLERS[kaart.pijler] || kaart.pijler }),
        kaart.verkenning ? el('span', { class: 'verk', tekst: '✧ verkenning' }) : null,
        totaal ? el('span', { style: 'margin-left:auto;color:var(--zacht)', tekst: (idx + 1) + '/' + totaal }) : null),
      el('h2', { tekst: kaart.titel }),
      el('div', { class: 'tekst' }, alinea, kaart.kern ? el('div', { class: 'kern', tekst: kaart.kern }) : null),
      el('div', { class: 'bron' },
        (SOORT[kaart.bron && kaart.bron.soort] || 'Bron') + ' · ',
        url ? el('a', { href: url, target: '_blank', rel: 'noopener', tekst: kaart.bron.titel || url }) : (kaart.bron && kaart.bron.titel) || '-'),
      el('div', { class: 'acties' },
        el('button', { 'data-a': 'like', class: a.like ? 'aan' : null, 'aria-label': 'Interessant', onclick: e => wissel(kaart, 'like', e.currentTarget) }, '♥'),
        el('button', { 'data-a': 'bewaar', class: a.bewaar ? 'aan' : null, 'aria-label': 'Bewaren', onclick: e => wissel(kaart, 'bewaar', e.currentTarget) }, '🔖'),
        el('button', { 'data-a': 'minder', class: a.minder ? 'aan' : null, 'aria-label': 'Minder hiervan', onclick: e => wissel(kaart, 'minder', e.currentTarget) }, '👎'),
        url ? el('a', { class: 'lees', href: url, target: '_blank', rel: 'noopener' }, 'Lees bron ↗') : null)));
  vak._kaart = kaart; vak._idx = idx;
  return vak;
}

/* ---------- schermen ---------- */
let index = null;      // feed/index.json
let tab = 'vandaag';

async function toonStapel(datum, kaarten, eindTekst) {
  const sch = $('#scherm');
  sch.className = 'scherm stapel';
  sch.replaceChildren();
  if (zicht) zicht.disconnect();
  stopZicht();
  kaarten.forEach((k, i) => sch.append(kaartVak(k, i, kaarten.length)));
  sch.append(el('section', { class: 'einde' }, el('strong', { tekst: 'Klaar voor vandaag' }), eindTekst || 'Morgenochtend staat er een nieuwe stapel klaar.'));
  zicht = new IntersectionObserver(items => {
    for (const it of items) {
      if (!it.target._kaart) continue;
      if (it.isIntersecting) {
        stopZicht(); zichtKaart = it.target._kaart; zichtStart = Date.now();
        if (datum) { S.gelezenTot[datum] = Math.max(S.gelezenTot[datum] || 0, it.target._idx); bewaar(); }
      } else if (zichtKaart === it.target._kaart) stopZicht();
    }
  }, { root: sch, threshold: 0.6 });
  sch.querySelectorAll('.kaart-vak').forEach(v => zicht.observe(v));
  sch.scrollTop = 0;
}

async function toonDag(datum) {
  $('#kop-info').textContent = datumNL(datum);
  try {
    const feed = await haalJson('feed/' + datum + '.json');
    await toonStapel(datum, feed.kaarten || []);
  } catch (e) {
    $('#scherm').replaceChildren(el('p', { class: 'leeg', tekst: 'Kon de feed van ' + datum + ' niet laden (' + e.message + ').' }));
  }
}

async function laadIndex() {
  try { index = await haalJson('feed/index.json'); } catch (e) { index = index || { dagen: [] }; }
  return index;
}

async function toonVandaag() {
  await laadIndex();
  const d = (index.dagen || [])[0];
  if (!d) { $('#scherm').replaceChildren(el('p', { class: 'leeg', tekst: 'Nog geen feed. De eerste stapel komt na de eerstvolgende ochtendrun.' })); return; }
  await toonDag(d);
}

async function toonArchief() {
  await laadIndex();
  $('#kop-info').textContent = 'Archief';
  const sch = $('#scherm'); sch.className = 'scherm';
  const lijst = el('div', { class: 'lijst' });
  for (const d of index.dagen || []) {
    lijst.append(el('button', { class: 'rij', onclick: () => toonDag(d) }, datumNL(d), el('small', { tekst: d })));
  }
  if (!(index.dagen || []).length) lijst.append(el('p', { class: 'leeg', tekst: 'Nog niets in het archief.' }));
  sch.replaceChildren(lijst);
}

function toonBewaard() {
  $('#kop-info').textContent = 'Bewaard';
  const kaarten = Object.values(S.bewaard).sort((a, b) => b.id.localeCompare(a.id));
  if (!kaarten.length) {
    const sch = $('#scherm'); sch.className = 'scherm';
    sch.replaceChildren(el('p', { class: 'leeg', tekst: 'Nog niets bewaard. Tik op 🔖 bij een kaart.' }));
    return;
  }
  toonStapel(null, kaarten, kaarten.length + ' bewaarde ideeën.');
}

function toonInstellingen() {
  $('#kop-info').textContent = 'Instellingen';
  const sch = $('#scherm'); sch.className = 'scherm';
  const aantalVuil = Object.keys(S.vuil).length;
  const tokenVeld = el('input', { type: 'password', value: S.token, placeholder: 'github_pat_…', autocomplete: 'off' });
  const repoVeld = el('input', { value: S.repo });
  const naamVeld = el('input', { value: S.apparaat });
  const stats = Object.values(S.acties);
  sch.replaceChildren(el('div', { class: 'lijst' },
    el('h3', { tekst: 'Leren van je likes' }),
    el('p', { class: 'uitleg', tekst: 'De ochtendrun leest je ♥, 🔖, 👎 en leestijd uit de map signalen/ in de repo. Daarvoor heeft deze telefoon een fine-grained GitHub-token nodig: alleen deze repo, alleen "Contents: Read and write". Het token blijft op dit apparaat.' }),
    el('label', { class: 'veld' }, el('span', { tekst: 'GitHub-token' }), tokenVeld),
    el('label', { class: 'veld' }, el('span', { tekst: 'Repo (eigenaar/naam)' }), repoVeld),
    el('label', { class: 'veld' }, el('span', { tekst: 'Naam van dit apparaat' }), naamVeld),
    el('button', { class: 'knop', onclick: () => {
      S.token = tokenVeld.value.trim(); S.repo = repoVeld.value.trim(); S.apparaat = naamVeld.value.trim().replace(/[^\w-]/g, '') || S.apparaat;
      bewaar(); meld('Opgeslagen');
    } }, 'Opslaan'),
    el('button', { class: 'knop grijs', onclick: () => sync(true) }, 'Nu synchroniseren'),
    el('p', { class: 'uitleg', tekst: aantalVuil + ' kaart(en) nog niet gesynchroniseerd. Laatste sync: ' + (S.laatsteSync ? new Date(S.laatsteSync).toLocaleString('nl-NL') : 'nooit') + '.' }),
    el('h3', { tekst: 'Jouw cijfers' }),
    el('p', { class: 'uitleg', tekst: stats.filter(a => a.like).length + ' ♥ · ' + stats.filter(a => a.bewaar).length + ' 🔖 · ' + stats.filter(a => a.minder).length + ' 👎 · ' + stats.length + ' kaarten bekeken' }),
    el('h3', { tekst: 'Over' }),
    el('p', { class: 'uitleg', tekst: 'Elke ochtend zoekt een Claude-routine nieuwe ideeën op het web en schrijft er kaartjes van, steeds met de bron erbij.' })));
}

/* ---------- sync naar GitHub ---------- */
function b64(s) { const b = new TextEncoder().encode(s); let x = ''; b.forEach(c => { x += String.fromCharCode(c); }); return btoa(x); }

async function sync(handmatig) {
  const ids = Object.keys(S.vuil);
  if (!S.token) { if (handmatig) meld('Eerst een token invullen en opslaan'); return; }
  if (!ids.length) { if (handmatig) meld('Niets te synchroniseren'); return; }
  const nu = new Date();
  const stempel = nu.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const pad = 'signalen/' + stempel + '-' + S.apparaat + '.json';
  const body = { apparaat: S.apparaat, tijd: nu.toISOString(),
    signalen: ids.map(id => Object.assign({ id }, S.acties[id])).filter(x => x.pijler) };
  try {
    const r = await fetch('https://api.github.com/repos/' + S.repo + '/contents/' + pad, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + S.token, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ message: 'signalen: ' + ids.length + ' kaart(en) van ' + S.apparaat, content: b64(JSON.stringify(body, null, 1)) })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    S.vuil = {}; S.laatsteSync = Date.now(); bewaar();
    if (handmatig) { meld(ids.length + ' kaart(en) gesynchroniseerd'); if (tab === 'instellingen') toonInstellingen(); }
  } catch (e) {
    if (handmatig) meld('Sync mislukt: ' + e.message);
  }
}
function autoSync() { if (S.token && Object.keys(S.vuil).length && Date.now() - S.laatsteSync > 30 * 60 * 1000) sync(false); }

/* ---------- navigatie ---------- */
function kies(t) {
  stopZicht();
  tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('actief', b.dataset.tab === t));
  ({ vandaag: toonVandaag, archief: toonArchief, bewaard: toonBewaard, instellingen: toonInstellingen })[t]();
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => kies(b.dataset.tab)));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // Alleen herladen als er al een oude versie actief was (niet bij de allereerste installatie).
  const hadVersie = !!navigator.serviceWorker.controller;
  let herladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadVersie && !herladen) { herladen = true; location.reload(); } });
}

kies('vandaag');
autoSync();

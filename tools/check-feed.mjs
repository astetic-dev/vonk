#!/usr/bin/env node
// Valideert een dagfeed. Gebruik: node tools/check-feed.mjs feed/2026-11-05.json [--urls]
// --urls: haalt elke bron-URL op en eist een 2xx/3xx-antwoord.
// Exit 0 = groen, 1 = fouten (op stderr, per regel).
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const PIJLERS = ['wetenschap', 'denken', 'geschiedenis'];
const SOORTEN = ['artikel', 'paper', 'boek', 'video', 'podcast'];
const pad = process.argv[2];
const metUrls = process.argv.includes('--urls');
if (!pad) { console.error('gebruik: node tools/check-feed.mjs feed/<datum>.json [--urls]'); process.exit(2); }

const fouten = [];
const fout = (w, t) => fouten.push((w ? w + ': ' : '') + t);
const woorden = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;

let feed;
try { feed = JSON.parse(readFileSync(pad, 'utf8')); } catch (e) { console.error('kan ' + pad + ' niet lezen: ' + e.message); process.exit(1); }

const datum = basename(pad, '.json');
if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) fout('', 'bestandsnaam moet JJJJ-MM-DD.json zijn');
if (feed.datum !== datum) fout('', `datum "${feed.datum}" past niet bij bestandsnaam ${datum}`);
if (!Array.isArray(feed.kaarten) || !feed.kaarten.length) fout('', 'kaarten ontbreekt of is leeg');

// eerder gezien (andere dagen) - ontdubbelen
const gezienPad = new URL('../feed/gezien.json', import.meta.url);
const gezien = existsSync(gezienPad) ? JSON.parse(readFileSync(gezienPad, 'utf8')) : { items: [] };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim();
const normUrl = u => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
const oudeTitels = new Set(gezien.items.filter(i => i.datum !== datum).map(i => norm(i.titel)));
const oudeUrls = new Set(gezien.items.filter(i => i.datum !== datum).map(i => normUrl(i.url)));

const ids = new Set(), urls = new Set(), titels = new Set(), domeinen = {};
const telling = {};
(feed.kaarten || []).forEach((k, i) => {
  const w = k.id || `kaart[${i}]`;
  const verwachtId = `${datum}-${String(i + 1).padStart(2, '0')}`;
  if (k.id !== verwachtId) fout(w, `id moet ${verwachtId} zijn`);
  if (ids.has(k.id)) fout(w, 'dubbele id'); ids.add(k.id);
  if (!PIJLERS.includes(k.pijler)) fout(w, `pijler "${k.pijler}" onbekend (${PIJLERS.join('/')})`);
  telling[k.pijler] = (telling[k.pijler] || 0) + 1;
  if (!Array.isArray(k.tags) || k.tags.length < 1 || k.tags.length > 4) fout(w, 'tags: 1-4 stuks');
  else k.tags.forEach(t => { if (!/^[a-z0-9-]+$/.test(t)) fout(w, `tag "${t}": alleen kleine letters, cijfers, streepjes`); });
  const tw = woorden(k.titel);
  if (tw < 2 || tw > 14) fout(w, `titel ${tw} woorden (2-14)`);
  const bw = woorden(k.tekst);
  if (bw < 35 || bw > 110) fout(w, `tekst ${bw} woorden (35-110)`);
  const kw = woorden(k.kern);
  if (kw < 4 || kw > 25) fout(w, `kern ${kw} woorden (4-25)`);
  if (typeof k.verkenning !== 'boolean') fout(w, 'verkenning moet true/false zijn');
  const verwachtLees = bw <= 60 ? 1 : 2;
  if (k.leesmin !== verwachtLees) fout(w, `leesmin moet ${verwachtLees} zijn (${bw} woorden: <=60 -> 1, anders 2)`);
  const b = k.bron || {};
  if (!b.titel) fout(w, 'bron.titel ontbreekt');
  if (!SOORTEN.includes(b.soort)) fout(w, `bron.soort "${b.soort}" onbekend`);
  if (b.gelezen !== true) fout(w, 'bron.gelezen moet true zijn - geen kaart zonder gelezen bron');
  let u; try { u = new URL(b.url); } catch (_) { fout(w, 'bron.url ongeldig'); }
  if (u && u.protocol !== 'https:') fout(w, 'bron.url moet https zijn');
  if (u) {
    const dom = u.hostname.replace(/^www\./, '').replace(/^[a-z]{2}\.(wikipedia\.org)$/, '$1');
    domeinen[dom] = (domeinen[dom] || 0) + 1;
    const nu = normUrl(b.url);
    if (urls.has(nu)) fout(w, 'zelfde bron-URL twee keer vandaag'); urls.add(nu);
    if (oudeUrls.has(nu)) fout(w, 'bron-URL al eerder gebruikt (gezien.json)');
  }
  const nt = norm(k.titel);
  if (titels.has(nt)) fout(w, 'dubbele titel'); titels.add(nt);
  if (oudeTitels.has(nt)) fout(w, 'titel al eerder gebruikt (gezien.json)');
});

for (const [d, n] of Object.entries(domeinen)) if (n > 4) fout('', `${n} kaarten van ${d} - hooguit 4 per domein (streef naar 3)`);

if (metUrls) {
  // max 4 tegelijk; netwerkfouten krijgen 2 herkansingen (tijdelijke haperingen tellen niet als dode link)
  const rij = [...(feed.kaarten || [])].filter(k => k.bron && k.bron.url);
  const haal = async url => {
    for (let poging = 1; ; poging++) {
      try { return await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (vonk-feedcheck)' }, signal: AbortSignal.timeout(20000) }); }
      catch (e) { if (poging >= 3) throw e; await new Promise(r => setTimeout(r, 1500 * poging)); }
    }
  };
  const werker = async () => {
    for (let k; (k = rij.shift());) {
      try {
        const r = await haal(k.bron.url);
        // 401/403/429: site blokkeert bots maar bestaat - waarschuwing, geen fout
        if (r.status === 401 || r.status === 403 || r.status === 429) console.warn(`waarschuwing ${k.id}: ${k.bron.url} gaf ${r.status} (botblokkade?)`);
        else if (r.status >= 400) fout(k.id, `bron.url gaf HTTP ${r.status} (dood: vervang de bron)`);
      } catch (e) { fout(k.id, `bron.url onbereikbaar na 3 pogingen: ${e.cause?.code || e.message} (netwerk testen, zie PROMPT stap 4)`); }
    }
  };
  await Promise.all([werker(), werker(), werker(), werker()]);
}

if (fouten.length) { fouten.forEach(f => console.error('FOUT ' + f)); console.error(`${fouten.length} fout(en) in ${pad}`); process.exit(1); }
console.log(`GROEN ${pad}: ${feed.kaarten.length} kaarten (${Object.entries(telling).map(([p, n]) => p + ' ' + n).join(', ')})${metUrls ? ', alle URLs bereikbaar' : ''}`);

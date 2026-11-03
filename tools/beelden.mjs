#!/usr/bin/env node
// Zoekt per kaart een passende afbeelding en schrijft die als `beeld` in de feed.
// Volgorde: 1) hoofdafbeelding van het Engelse Wikipedia-artikel kaart.beeldWiki (meest betrouwbaar)
//           2) Wikimedia Commons-zoekopdracht kaart.beeldZoek (vrije licentie)
//           3) hoofdafbeelding van een Wikipedia-bron
//           4) og:image van de bronpagina (zoals een link-preview, met bronvermelding)
// kaart.geenBeeld = true -> bewust geen beeld (app toont kleurvlak).
// Gebruik: node tools/beelden.mjs feed/<datum>.json [--opnieuw] [--alleen=02,15] [--bekijk]
//   standaard: alleen kaarten zonder beeld; --opnieuw: alle; --alleen: deze nummers
//   --bekijk: zet kleine voorbeelden in <tmp>/vonk-beelden/ om met Read te bekijken
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const pad = process.argv[2];
const opnieuw = process.argv.includes('--opnieuw');
if (!pad) { console.error('gebruik: node tools/beelden.mjs feed/<datum>.json [--opnieuw]'); process.exit(2); }
const feed = JSON.parse(readFileSync(pad, 'utf8'));

const UA = { 'User-Agent': 'VonkFeed/1.0 (https://github.com/astetic-dev/vonk)' };
const VRIJ = /^(cc0|public domain|pd|cc by(-sa)?( \d\.\d)?|cc-by(-sa)?|attribution|no restrictions)/i;
const BREEDTE = 1080;
// HTML -> tekst; Commons verstopt machine-data in onzichtbare spans ("date QS:P,+1796...")
const kaal = html => String(html || '')
  .replace(/<(span|div)[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<[^>]*>/g, '').replace(/date QS:\S*/g, '').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').replace(/\(\s*\)/g, '').trim();
// svg mag: Commons levert er een png-thumbnail van (thumburl)
const BEELDMIME = /^image\/(jpeg|png|webp|svg\+xml)/;
const kort = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function json(url) {
  for (let p = 1; ; p++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { if (p >= 3) throw e; await new Promise(r => setTimeout(r, 1500 * p)); }
  }
}

async function isBeeld(url) {
  try {
    const r = await fetch(url, { method: 'GET', headers: { ...UA, Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(15000) });
    return r.ok && /^image\/(jpeg|png|webp|gif|avif)/.test(r.headers.get('content-type') || '');
  } catch (_) { return false; }
}

function vanImageinfo(ii, pagina) {
  const m = ii.extmetadata || {};
  const licentie = kaal(m.LicenseShortName && m.LicenseShortName.value);
  if (!VRIJ.test(licentie)) return null;
  const maker = kort(kaal(m.Artist && m.Artist.value) || 'onbekend', 60);
  return { url: ii.thumburl || ii.url, soort: 'commons', credit: `${maker} · ${licentie} · Wikimedia Commons`, pagina: ii.descriptionurl || pagina };
}

async function commonsZoek(term) {
  const q = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '8',
    gsrsearch: `${term} filetype:bitmap|drawing`, prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: String(BREEDTE) });
  const d = await json('https://commons.wikimedia.org/w/api.php?' + q);
  const paginas = Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index);
  for (const p of paginas) {
    const ii = p.imageinfo && p.imageinfo[0];
    if (!ii || !BEELDMIME.test(ii.mime) || (ii.width < 500 && !ii.mime.includes('svg'))) continue;   // geen tiff/pdf, geen postzegels
    const b = vanImageinfo(ii);
    if (b) return b;
  }
  return null;
}

async function wikipediaLead(bronUrl) {
  const u = new URL(bronUrl);
  if (!/\.wikipedia\.org$/.test(u.hostname) || !u.pathname.startsWith('/wiki/')) return null;
  const titel = decodeURIComponent(u.pathname.slice(6));
  const q = new URLSearchParams({ action: 'query', format: 'json', prop: 'pageimages', piprop: 'name', titles: titel, redirects: '1' });
  const d = await json(`https://${u.hostname}/w/api.php?` + q);
  const pg = Object.values((d.query && d.query.pages) || {})[0];
  if (!pg || !pg.pageimage) return null;
  const q2 = new URLSearchParams({ action: 'query', format: 'json', titles: 'File:' + pg.pageimage, prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: String(BREEDTE) });
  const d2 = await json('https://commons.wikimedia.org/w/api.php?' + q2);
  const ii = Object.values((d2.query && d2.query.pages) || {})[0]?.imageinfo?.[0];
  if (!ii || !BEELDMIME.test(ii.mime)) return null;
  return vanImageinfo(ii);
}

async function ogImage(bron) {
  const r = await fetch(bron.url, { headers: { 'User-Agent': 'Mozilla/5.0 (VonkFeed link preview)' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  const html = (await r.text()).slice(0, 300000);
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/i);
  const c = m && m[0].match(/content=["']([^"']+)["']/i);
  if (!c) return null;
  const url = new URL(c[1].replace(/&amp;/g, '&'), bron.url).href;
  if (!url.startsWith('https://')) return null;
  return { url, soort: 'bron', credit: 'Afbeelding: ' + new URL(bron.url).hostname.replace(/^www\./, ''), pagina: bron.url };
}

// klein voorbeeld ophalen zodat de routine het beeld met Read kan BEKIJKEN
async function bewaarVoorbeeld(k) {
  const klein = k.beeld.soort === 'commons' ? k.beeld.url.replace(/\/\d+px-/, '/330px-') : k.beeld.url;
  try {
    const r = await fetch(klein, { headers: UA, signal: AbortSignal.timeout(20000) });
    const ext = ((r.headers.get('content-type') || '').match(/image\/(jpeg|png|webp|gif)/) || [, 'jpg'])[1].replace('jpeg', 'jpg');
    const bestand = join(VOORBEELD, `${k.id}.${ext}`);
    writeFileSync(bestand, Buffer.from(await r.arrayBuffer()));
    return bestand;
  } catch (e) { return `(voorbeeld mislukt: ${e.message})`; }
}

const alleen = (process.argv.find(a => a.startsWith('--alleen=')) || '').slice(9).split(',').filter(Boolean);
const bekijk = process.argv.includes('--bekijk');
const VOORBEELD = join(tmpdir(), 'vonk-beelden');
if (bekijk) mkdirSync(VOORBEELD, { recursive: true });

let gevonden = 0;
for (const k of feed.kaarten) {
  const nr = k.id.slice(-2);
  const doen = alleen.length ? alleen.includes(nr) : (opnieuw || !k.beeld);
  if (!doen) { if (k.beeld) gevonden++; continue; }
  delete k.beeld;
  if (k.geenBeeld) { console.log(`${k.id} geenBeeld: kleurvlak`); continue; }
  const pogingen = [
    ['beeldWiki', () => k.beeldWiki ? wikipediaLead('https://en.wikipedia.org/wiki/' + encodeURIComponent(k.beeldWiki.replace(/ /g, '_'))) : null],
    ['beeldZoek', () => k.beeldZoek ? commonsZoek(k.beeldZoek) : null],
    ['bron-wikipedia', () => wikipediaLead(k.bron.url)],
    ['og:image', () => ogImage(k.bron)]
  ];
  for (const [naam, f] of pogingen) {
    try {
      const b = await f();
      if (b && await isBeeld(b.url)) { k.beeld = b; console.log(`${k.id} ${naam}: ${b.credit}`); break; }
    } catch (e) { console.warn(`${k.id} ${naam} mislukt: ${e.message}`); }
  }
  if (k.beeld) { gevonden++; if (bekijk) console.log(`   bekijk: ${await bewaarVoorbeeld(k)}`); }
  else console.log(`${k.id} geen beeld (app toont kleurvlak)`);
}
writeFileSync(pad, JSON.stringify(feed, null, 2) + '\n');
console.log(`${gevonden}/${feed.kaarten.length} kaarten met beeld`);

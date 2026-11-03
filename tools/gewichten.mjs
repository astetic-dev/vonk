#!/usr/bin/env node
// Verwerkt nieuwe signalen uit signalen/*.json in profiel/gewichten.json,
// verplaatst ze naar signalen/verwerkt/ en drukt het dagplan (verdeling) af.
// Gebruik: node tools/gewichten.mjs [--droog]   (--droog: niets schrijven/verplaatsen)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const droog = process.argv.includes('--droog');
const GP = join(root, 'profiel', 'gewichten.json');
const SIG = join(root, 'signalen');
const KLAAR = join(SIG, 'verwerkt');

const NEUTRAAL = 1, MIN = 0.2, MAX = 3, AFKOEL = 0.97;
const PUNT = { like: 0.3, bewaar: 0.5, minder: -0.3, lezen: 0.1 };   // lezen = >=25 s in beeld
const TOTAAL = 15;

const g = existsSync(GP) ? JSON.parse(readFileSync(GP, 'utf8'))
  : { bijgewerkt: null, pijlers: { wetenschap: 1, denken: 1, geschiedenis: 1 }, tags: {} };
const klem = x => Math.round(Math.min(MAX, Math.max(MIN, x)) * 1000) / 1000;

// 1. afkoelen naar neutraal, per verstreken dag
const vandaag = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
const dagen = g.bijgewerkt ? Math.max(0, Math.round((Date.parse(vandaag) - Date.parse(g.bijgewerkt)) / 864e5)) : 0;
const f = Math.pow(AFKOEL, dagen);
for (const k of Object.keys(g.pijlers)) g.pijlers[k] = klem(NEUTRAAL + (g.pijlers[k] - NEUTRAAL) * f);
for (const k of Object.keys(g.tags)) {
  g.tags[k] = klem(NEUTRAAL + (g.tags[k] - NEUTRAAL) * f);
  if (Math.abs(g.tags[k] - NEUTRAAL) < 0.02) delete g.tags[k];
}

// 2. nieuwe signalen verwerken (laatste stand per kaart-id telt; oudere bestanden eerst)
const bestanden = existsSync(SIG) ? readdirSync(SIG).filter(n => n.endsWith('.json')).sort() : [];
const perKaart = {};
for (const n of bestanden) {
  try { for (const s of JSON.parse(readFileSync(join(SIG, n), 'utf8')).signalen || []) perKaart[s.id] = s; }
  catch (e) { console.error('overgeslagen (onleesbaar): ' + n); }
}
// eerder verwerkte stand per kaart, zodat een kaart die opnieuw gesynct wordt niet dubbel telt
g.verwerkt = g.verwerkt || {};
let n = 0;
for (const [id, s] of Object.entries(perKaart)) {
  const score = s2 => (s2.like ? PUNT.like : 0) + (s2.bewaar ? PUNT.bewaar : 0) + (s2.minder ? PUNT.minder : 0) + ((s2.sec || 0) >= 25 ? PUNT.lezen : 0);
  const delta = score(s) - (g.verwerkt[id] || 0);
  g.verwerkt[id] = score(s);
  if (!delta) continue;
  n++;
  if (s.pijler in g.pijlers) g.pijlers[s.pijler] = klem(g.pijlers[s.pijler] + delta / 2);
  for (const t of s.tags || []) g.tags[t] = klem((g.tags[t] ?? NEUTRAAL) + delta);
}
// verwerkt-geheugen beperkt tot de laatste 120 dagen
for (const id of Object.keys(g.verwerkt)) if (Date.parse(vandaag) - Date.parse(id.slice(0, 10)) > 120 * 864e5) delete g.verwerkt[id];
g.bijgewerkt = vandaag;

// 3. dagplan: 10 % verkenning, 20 % buren, 70 % volgens pijlergewicht
const verkenning = Math.round(TOTAAL * 0.1), buren = Math.round(TOTAAL * 0.2), kern = TOTAAL - verkenning - buren;
const som = Object.values(g.pijlers).reduce((a, b) => a + b, 0);
const ruw = Object.entries(g.pijlers).map(([p, w]) => [p, Math.max(1, kern * w / som)]);
const verdeling = Object.fromEntries(ruw.map(([p, x]) => [p, Math.floor(x)]));
let rest = kern - Object.values(verdeling).reduce((a, b) => a + b, 0);
for (const [p] of ruw.sort((a, b) => (b[1] % 1) - (a[1] % 1))) { if (rest <= 0) break; verdeling[p]++; rest--; }
const gesorteerd = Object.entries(g.tags).sort((a, b) => b[1] - a[1]);
const plan = {
  datum: vandaag, nieuweSignalen: n, bestanden: bestanden.length,
  verdeling: { ...verdeling, buren, verkenning },
  favorieteTags: gesorteerd.filter(([, w]) => w > 1.05).slice(0, 12).map(([t, w]) => `${t} (${w})`),
  mijdTags: gesorteerd.filter(([, w]) => w < 0.75).map(([t, w]) => `${t} (${w})`),
  pijlerGewichten: g.pijlers
};

if (!droog) {
  mkdirSync(join(root, 'profiel'), { recursive: true });
  writeFileSync(GP, JSON.stringify(g, null, 2) + '\n');
  if (bestanden.length) { mkdirSync(KLAAR, { recursive: true }); for (const b of bestanden) renameSync(join(SIG, b), join(KLAAR, b)); }
}
console.log(JSON.stringify(plan, null, 2));

#!/usr/bin/env node
// Na een groene check: zet de dag in feed/index.json (nieuwste eerst) en
// de titels/URLs in feed/gezien.json (laatste 90 dagen).
// Gebruik: node tools/registreer.mjs feed/2026-11-05.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pad = process.argv[2];
if (!pad) { console.error('gebruik: node tools/registreer.mjs feed/<datum>.json'); process.exit(2); }
const datum = basename(pad, '.json');
const feed = JSON.parse(readFileSync(pad, 'utf8'));

const IP = join(root, 'feed', 'index.json');
const index = existsSync(IP) ? JSON.parse(readFileSync(IP, 'utf8')) : { dagen: [] };
index.dagen = [...new Set([datum, ...index.dagen])].sort().reverse();
writeFileSync(IP, JSON.stringify(index, null, 2) + '\n');

const GP = join(root, 'feed', 'gezien.json');
const gezien = existsSync(GP) ? JSON.parse(readFileSync(GP, 'utf8')) : { items: [] };
const grens = Date.parse(datum) - 90 * 864e5;
gezien.items = gezien.items.filter(i => i.datum !== datum && Date.parse(i.datum) >= grens);
for (const k of feed.kaarten) gezien.items.push({ datum, titel: k.titel, url: k.bron.url, tags: k.tags });
writeFileSync(GP, JSON.stringify(gezien, null, 1) + '\n');
console.log(`geregistreerd: ${datum} (${feed.kaarten.length} kaarten); index ${index.dagen.length} dagen, gezien ${gezien.items.length} items`);

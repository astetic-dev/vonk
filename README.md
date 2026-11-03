# Vonk

Een eigen idee-scroller. Elke ochtend zoekt een Claude-routine op het web naar
interessante ideeën uit **wetenschap & tech**, **denken & productiviteit** en
**geschiedenis & filosofie**. Daar maakt hij 15 korte kaartjes van, met de bron erbij.
Op de telefoon swipe je erdoorheen. Je ♥ / 🔖 / 👎 sturen de feed van morgen.

App: https://astetic-dev.github.io/vonk/

## Hoe het werkt
```
06:00  cloud-routine  ->  routine/PROMPT.md
        tools/gewichten.mjs   likes verwerken -> dagplan (70% voorkeur, 20% buren, 10% verkenning)
        WebSearch + WebFetch  15 bronnen zoeken en echt lezen
        feed/<datum>.json     kaartjes schrijven
        tools/check-feed.mjs  schema, lengtes, dubbels, URL's bereikbaar
        tools/registreer.mjs  feed/index.json + feed/gezien.json bijwerken
        git push              GitHub Pages publiceert
telefoon (PWA)  swipen, ♥ 🔖 👎, leestijd  ->  "Sync" schrijft signalen/<tijd>-<apparaat>.json
```

## Mappen
| Pad | Wie schrijft |
|---|---|
| `index.html`, `app.js`, `style.css`, `sw.js` | jij (de app) |
| `profiel/interesses.md` | jij: de onderwerpen en de smaak |
| `profiel/gewichten.json` | de routine |
| `feed/` | de routine |
| `signalen/` | de telefoon (sync), en de routine verplaatst ze naar `verwerkt/` |
| `routine/PROMPT.md`, `tools/` | jij (het gedrag van de routine) |

## Sync instellen (eenmalig per telefoon)
1. GitHub -> Settings -> Developer settings -> Fine-grained tokens -> Generate.
   Repository access: **alleen `vonk`**. Permissions: **Contents: Read and write**. Verder niets.
2. In de app: Instellingen -> token plakken -> Opslaan -> Nu synchroniseren.
Het token blijft in de browseropslag van de telefoon en komt nooit in de repo.
Daarna synct de app vanzelf als je hem wegklikt (hooguit eens per half uur).

## Lokaal testen
```
npx http-server -p 8080 .       # of: python -m http.server 8080
node tools/check-feed.mjs feed/2026-11-04.json --urls
node tools/gewichten.mjs --droog
```

# Vonk — ochtendrun

Je maakt de feed van vandaag voor Vonk: 15 korte idee-kaartjes in het Nederlands, elk
gebaseerd op een bron die je **echt gelezen** hebt. Werk in de root van deze repo.

**Grens:** schrijf alleen in `feed/`, `profiel/gewichten.json` en `signalen/`. Wijzig nooit de
app-bestanden (`index.html`, `app.js`, `style.css`, `sw.js`), `tools/`, `routine/` of `profiel/interesses.md`.

## 0. Datum
Bepaal de datum van vandaag in Europe/Amsterdam met node. `date` is hier niet betrouwbaar, want niet elke shell kent de tijdzone:
```
node -e "console.log(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam'}).format(new Date()))"
```
Hieronder heet die datum `DATUM`. Bestaat `feed/DATUM.json` al en geeft `node tools/check-feed.mjs feed/DATUM.json` (zonder `--urls`) GROEN, dan stop je meteen met "feed bestond al".

## 1. Profiel en plan
1. Lees `profiel/interesses.md`. Dat zijn de onderwerpen en de smaak.
2. Draai `node tools/gewichten.mjs`. Dat verwerkt de likes van de telefoon en drukt het **dagplan** af. Controleer dat `datum` daarin gelijk is aan DATUM.
   - `verdeling`: het aantal kaarten per pijler, plus `buren` en `verkenning`. Samen zijn dat 15 kaarten. Houd je aan deze aantallen.
   - `favorieteTags`: kies hier vaker onderwerpen uit, maar niet steeds hetzelfde.
   - `mijdTags`: kies deze onderwerpen vandaag niet.
3. Lees `feed/gezien.json` (titels, URL's en tags van de laatste 90 dagen). Kies niets dat daar al op lijkt.
   Een ander aspect van hetzelfde grote thema mag wel, maar niet hetzelfde idee.

Betekenis van de soorten:
- **pijler-kaarten** (`wetenschap`/`denken`/`geschiedenis` in de verdeling): passen in die pijler. Gebruik de favoriete tags als richting.
- **buren:** onderwerpen die *naast* een favoriete tag liggen (bv. favoriet `bias` -> buur `statistiek` of `rechtspraak`).
  Zijn er nog geen favoriete tags, dan kies je buren van andere kaarten van vandaag. Een buur deelt dan een tag met zo'n kaart, maar het idee is anders.
- **verkenning:** iets buiten het gebruikelijke dat toch in een van de drie pijlers past. Zet `"verkenning": true`. Alle andere kaarten krijgen `false`.
- Buren en verkenningen krijgen de pijler waar ze het best passen. De pijlertotalen hoeven daarna niet in evenwicht te zijn.

## 2. Bronnen zoeken en lezen
Doel: 15 verschillende ideeën, samen een gevarieerde mix van ongeveer 1/3 actueel (laatste ~30 dagen) en 2/3 tijdloos.
- Zoek met WebSearch. Gebruik gevarieerde zoekvragen, bijvoorbeeld "<onderwerp> explained", "new study <onderwerp> 2026", of Nederlandstalige zoekvragen.
- **Spreiding:** streef naar minstens 7 verschillende domeinen en hooguit 3 kaarten per domein. Wikipedia is een vangnet, niet de standaard. De check weigert 5 of meer kaarten van één domein. Nederlandstalige bronnen zijn welkom, maar niet verplicht.
- Gebruik bij voorkeur bronnen uit `interesses.md`, of vergelijkbare kwaliteitsbronnen. Geen contentfarms, geen AI-spampagina's, geen bronnen achter een betaalmuur.
- **Lees elke bron met WebFetch** voordat je erover schrijft. Lukt het ophalen niet (betaalmuur, blokkade of een lege pagina), kies dan een andere bron. **Geen kaart zonder gelezen bron.**
- **Zo lees je goed:** WebFetch geeft een samenvatting die stuurt op jouw vraag. Vraag dus gericht: "geef de kernclaim, het mechanisme, en alle namen, jaartallen en getallen letterlijk met het citaat erbij". Is de pagina lang, lees dan verder met `offset`. Verzin nooit feiten, citaten, jaartallen, cijfers of titels. Alles op de kaart, ook de brontitel, moet je in de opgehaalde tekst hebben gezien.
- Een boek mag als `"soort": "boek"`, maar dan met een gelezen samenvatting/recensie of de uitgeverspagina als URL.
- Elke bron-URL maar één keer. Gebruik de canonieke https-URL zonder tracking-parameters.

## 3. Kaartjes schrijven
Schrijf `feed/DATUM.json`:
```json
{ "datum": "DATUM", "kaarten": [
  { "id": "DATUM-01", "pijler": "wetenschap|denken|geschiedenis", "tags": ["kleine-letters", "max-4"],
    "titel": "Pakkende maar eerlijke titel (2-14 woorden)",
    "tekst": "35-110 woorden. Eén idee. Eén of twee alinea's, gescheiden door \n\n.",
    "kern": "Eén zin om te onthouden (4-25 woorden).",
    "bron": { "titel": "Originele titel van de bron", "url": "https://...", "soort": "artikel|paper|boek|video|podcast", "gelezen": true },
    "leesmin": 2, "verkenning": false,
    "beeldWiki": "Engelse Wikipedia-artikeltitel waarvan de hoofdafbeelding past (optioneel)",
    "beeldZoek": "2-5 Engelse woorden voor Wikimedia Commons (optioneel)" } ] }
```
Beeld-hints (het script `tools/beelden.mjs` zoekt de afbeelding er later bij; jij schrijft geen `beeld`-veld zelf):
- `beeldWiki` werkt het best bij een persoon, plaats, object, organisme of gebeurtenis: `"Epictetus"`, `"Antikythera mechanism"`, `"Physarum polycephalum"`. Neem het artikel waarvan de **hoofdfoto** het onderwerp laat zien.
- `beeldZoek` is voor iets concreets zonder eigen artikel: `"spider web dew"`, `"Klein bottle glass"`. Wees letterlijk en visueel. Gebruik geen abstracte woorden, en ook geen namen die ook iets anders kunnen zijn (bij "Epictetus" vond Commons een vlinder).
- Abstract idee zonder zinnig beeld? Geef dan geen hints. Het script probeert de bron zelf, en anders toont de app een kleurvlak. Dat is prima.
Stijl:
- Nederlands, helder, concreet, actief. Spreek de lezer niet aan met "je moet". Geen clickbait, geen emoji.
- Begin de tekst met het verrassende of het concrete (een getal, een scène of een paradox), niet met "In dit artikel…".
- Leg het **waarom/hoe** uit, niet alleen het wat. Eén idee per kaart. Varieer de lengte: korte kaarten (40-60 woorden) zijn prima als het idee scherp is.
- `kern` is geen herhaling van de titel. Het is de les of het inzicht.
- Tags: kleine letters met koppeltekens (`cognitieve-bias`, `ruimtevaart`, `romeinse-rijk`). Hergebruik waar het kan tags die al in `gezien.json` staan, zodat de likes op dezelfde tags terechtkomen.
- Zet de kaarten in een prettige volgorde: wissel de pijlers af en begin met een sterke kaart. Nummer de id's daarna doorlopend van 01 tot 15.
- `leesmin` is een vaste regel: **1 bij hooguit 60 woorden tekst, anders 2.** De check controleert dat.

## 4. Controleren
1. Draai `node tools/check-feed.mjs feed/DATUM.json --urls`.
2. Is het rood, dan herstel je elke FOUT en draai je de check opnieuw, tot het groen is.
   - `HTTP 4xx/5xx` betekent dat de pagina dood is. Vervang dan de bron (opnieuw lezen) of de hele kaart.
   - `onbereikbaar` (netwerkfout, ook na de ingebouwde herhaalpoging): test eerst of het netwerk werkt, bv. met `curl -sI https://www.wikipedia.org`. Werkt het netwerk wel, dan vervang je de bron. Werkt het niet, dan wacht je even en draai je de check opnieuw.
   - Een `waarschuwing` (401/403/429, botblokkade) is toegestaan, mits jij de pagina met WebFetch wel hebt gelezen.
3. Lees de feed nog één keer kritisch: klopt elke bewering met wat je las? Twijfel je, dan verwijder je die bewering.
4. **Beelden:** draai `node tools/beelden.mjs feed/DATUM.json --bekijk`. Bij elk gevonden beeld staat een pad naar een klein voorbeeld.
   **Bekijk elk voorbeeld met Read** en beoordeel: laat het beeld het onderwerp van de kaart zien, of iets wat er duidelijk mee te maken heeft?
   - Past het niet (verkeerd onderwerp, naamgenoot, lelijk, alleen tekst of een logo), pas dan `beeldWiki`/`beeldZoek` aan en draai `node tools/beelden.mjs feed/DATUM.json --alleen=NN --bekijk`. Hooguit 2 pogingen per kaart.
   - Lukt het niet, zet dan `"geenBeeld": true` en draai `--alleen=NN`. Dan toont de app een kleurvlak. Een kleurvlak is beter dan een verkeerd beeld.
   - Draai daarna de check uit stap 1 opnieuw (zonder `--urls` is genoeg). Een waarschuwing "geen beeld" mag alleen overblijven als `geenBeeld` gezet is.
5. Draai `node tools/registreer.mjs feed/DATUM.json`.

## 5. Opslaan
```
git add feed profiel signalen
git commit -m "feed: DATUM (15 kaarten)"
git push
```
Mislukt de push door een gelijktijdige sync van de telefoon, doe dan `git pull --rebase` en push opnieuw.
Komen nieuwe signalen binnen via die rebase, dan worden die morgen verwerkt.

Rapporteer tot slot in 3 regels: het aantal kaarten per pijler, hoeveel nieuwe signalen verwerkt zijn, en eventuele vervangen bronnen.

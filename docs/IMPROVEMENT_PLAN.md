# IconTale – Verbesserungsplan

> Detaillierter, umsetzungsreifer Plan zur Verbesserung von IconTale (Repo-Stand `main`, Version `3.0.0`).
> Jeder Punkt ist so formuliert, dass er als **eigener, gut reviewbarer Pull Request** umgesetzt werden kann.
> Status-Emojis: 🔴 kritisch · 🟠 hoch · 🟡 mittel · 🟢 nice-to-have.

---

## Inhalt

1. [Performance & Assets](#1-performance--assets)
2. [Sicherheit](#2-sicherheit)
3. [Zuverlässigkeit & Fehlerbehandlung](#3-zuverlässigkeit--fehlerbehandlung)
4. [Barrierefreiheit (a11y)](#4-barrierefreiheit-a11y)
5. [UX & Design-Politur](#5-ux--design-politur)
6. [Mobile & Responsive](#6-mobile--responsive)
7. [PWA & Offline](#7-pwa--offline)
8. [Code-Qualität & Architektur](#8-code-qualität--architektur)
9. [Feature-Ideen](#9-feature-ideen)
10. [Internationalisierung (i18n)](#10-internationalisierung-i18n)
11. [Observability & Ops](#11-observability--ops)
12. [Tests & CI](#12-tests--ci)
13. [Dokumentation & Meta](#13-dokumentation--meta)
14. [Vorgeschlagene Reihenfolge der PRs](#14-vorgeschlagene-reihenfolge-der-prs)

---

## 1. Performance & Assets

### 1.1 🔴 `og-image.png` ist 5.1 MB groß
- **Problem:** `public/og-image.png` ist **5 279 576 Bytes** – das wird aktuell sowohl vom Service-Worker vorgecached (siehe `public/sw.js` → `SHELL_ASSETS`) als auch über `<meta property="og:image">` auf _jeder_ Social-Media-Vorschau geladen. Das bläht den initialen PWA-Cache massiv auf und verlangsamt Previews in Slack/WhatsApp/Discord.
- **Lösung:**
  - Auf ≤ 300 KB re-exportieren (z. B. 1200×630, JPEG q80 oder AVIF/WebP).
  - Aus `SHELL_ASSETS` im Service-Worker entfernen (es ist kein App-Shell-Asset).
  - Zusätzlich `og-image.webp` erzeugen, HTML-Metatag bei `og:image:type` ergänzen.
- **Akzeptanzkriterien:** Datei < 300 KB, Lighthouse „Properly size images“ grün, Twitter-Card-Validator lädt < 1 s.
- **Dateien:** `public/og-image.png`, `public/index.html`, `public/sw.js`.

### 1.2 🟠 `styles.css` ist 43 KB unkomprimiert und lädt **blockierend**
- **Problem:** Eine einzige große CSS-Datei (1974 LOC) wird synchron geladen. Es gibt zwar `npm run build:css`, aber in `index.html` wird weiterhin `styles.css` statt `styles.min.css` referenziert.
- **Lösung:**
  - In Produktion `styles.min.css` ausliefern (Server-Check oder Build-Schritt, der `href` rewritet).
  - Critical-CSS (Header, Menü, Lobby) inline in `<head>` einbetten; Rest via `<link rel="preload" ... as="style" onload="this.rel='stylesheet'">` asynchron laden.
  - `build:css` in `npm run build` einbinden, damit CI/Docker immer minifiziertes CSS erzeugen.
- **Akzeptanzkriterien:** FCP-Unterschied sichtbar (Lighthouse < 1.5 s auf 3G-Fast), `styles.min.css` < 25 KB gzip.

### 1.3 🟠 Google-Fonts synchron blockieren das Rendering
- **Problem:** `index.html` lädt Inter über `fonts.googleapis.com` ohne `font-display: swap`-Schutz und ohne lokalen Fallback-Stack als Critical Font.
- **Lösung:**
  - `&display=swap` ist bereits gesetzt – zusätzlich `<link rel="preload" as="font" crossorigin>` für Inter 600 & 700 (woff2) hinzufügen **oder** Inter via `@fontsource/inter` self-hosten (empfohlen wegen CSP-Aufweichung).
  - Danach in CSP (`server.ts` → `helmet`) die `fonts.googleapis.com`/`fonts.gstatic.com`-Einträge aus `styleSrc`/`fontSrc` entfernen.
- **Akzeptanzkriterien:** Keine CLS durch Font-Swap; CSP ohne 3rd-party-Hosts; eine Request weniger im Netzwerk-Tab.

### 1.4 🟡 Icon-Tooltips & große Listen unnötig neu gerendert
- **Problem:** `ui.js → updatePlayersList` und `renderResultsChat` bauen den DOM bei jedem Update komplett neu auf (`innerHTML = ''` + Append). Bei 20 Spielern + mehreren Events/Sek. merkbar.
- **Lösung:** Entweder kleinen Reconciler (Key = `player.id`) einbauen oder auf [lit-html](https://lit.dev/docs/libraries/standalone-templates/) umstellen. Alternativ: nur Diff rendern (neue Spieler append, gegangene removen).
- **Akzeptanzkriterien:** Keine sichtbaren Flicker beim Beitreten, Chrome-DevTools „Rendering“ zeigt < 3 Layout-Shifts/Update.

### 1.5 🟡 `EMOJI_NAMES` ist unvollständig
- **Problem:** `public/js/constants.js` definiert 83 Emojis in `EMOJIS`, aber `EMOJI_NAMES` deckt davon nur ~50 ab – die übrigen Tooltips sind leer (`''`).
- **Lösung:** Komplette Namen-Map ergänzen (alle 83 Einträge) oder Mapping aus einer zentralen Quelle (JSON) generieren, die auch `lib/emoji-packs.ts` nutzt (einheitliche Source of Truth).
- **Akzeptanzkriterien:** Jedes Emoji hat Tooltip, Lint/Test prüft Vollständigkeit.

### 1.6 🟢 Socket.io-Client per `<script>` – kein Bundler, aber duplizierter Code
- **Problem:** Der Client lädt `socket.io.js` über globales `<script>`. Der Rest läuft als ES-Modules. Funktioniert, aber verhindert Tree-Shaking.
- **Lösung:** Optional einen minimalistischen Build-Schritt (esbuild) einführen, der `public/js/` zu einem einzigen `app.js` bündelt und Socket.io mit einschließt. Geringer Aufwand, aber reduziert Round-Trips und ermöglicht Minification/Hash-Busting.

---

## 2. Sicherheit

### 2.1 🔴 `'unsafe-inline'` in CSP
- **Problem:** `server.ts` erlaubt `scriptSrc: ["'self'", "'unsafe-inline'", ...]`. In `index.html` gibt es zwei inline `<script>`-Blöcke (JSON-LD + Service-Worker-Register) und ein inline `<style>`-Fallback im `<noscript>`-Block, deshalb wurde `unsafe-inline` gesetzt.
- **Lösung:**
  - Service-Worker-Register in eine externe Datei (`/js/register-sw.js`) verschieben.
  - JSON-LD kann bleiben (als `type="application/ld+json"` von CSP **nicht** betroffen, daher `scriptSrc 'unsafe-inline'` nicht nötig dafür).
  - Inline-CSS im `<noscript>` per Klasse ersetzen.
  - CSP auf `script-src 'self'` verschärfen. `style-src`: entweder Hashes oder `'unsafe-inline'` behalten, dokumentieren.
- **Akzeptanzkriterien:** CSP-Scanner (https://csp-evaluator.withgoogle.com/) gibt keine „unsafe-inline for scripts“-Warnung mehr.

### 2.2 🟠 Socket.io-Authentifizierung prüft nur Origin-Header
- **Problem:** `io.use((socket, next) => ...)` in `server.ts` akzeptiert jede Verbindung mit erlaubtem Origin. Kein Token, keine User-Identität.
- **Lösung:** Für Reconnect werden Session-Tokens bereits genutzt. Für **neue** Connects optional ein lightweight „join token“ einführen (JWT mit 2 min Lifetime, vom HTTP-Endpunkt beim Lobby-Create/Join zurückgegeben), damit man nicht rein per Emission eine Lobby hijacken kann.
- **Akzeptanzkriterien:** Socket ohne gültiges Token kann keine `create-lobby`/`join-lobby`-Events mehr absetzen (optional hinter Feature-Flag).

### 2.3 🟠 Rate-Limit nur sehr grob
- **Problem:** `SOCKET_RATE_MAX = 60` Events / 10 s pro Socket. Ein bösartiger Client kann aber `submit-guess`/`submit-story` mit riesigen Payloads spammen, solange er unter 6 Req/s bleibt.
- **Lösung:**
  - Pro Event-Typ differenzierte Limits (z. B. `submit-story` max 1×, `update-settings` max 10×/10 s).
  - Größenlimit der Payload im `socket.use`-Hook prüfen (JSON-Bytes).
  - Konsistente Limits in Redis (wichtig für horizontale Skalierung später).
- **Akzeptanzkriterien:** Integrationstest, der gezielt Event-Flood schickt, führt zu Disconnect.

### 2.4 🟡 `wordfilter.ts` nur 54 LOC – vermutlich minimale Liste
- **Prüfen & ausbauen:** Deutsche & englische Beleidigungen, Umlaut-Varianten, Leet-Speak (`a→@`, `s→$`). Alternativ [obscenity](https://www.npmjs.com/package/obscenity) einbinden.
- Einstellung via Env-Variable `WORDFILTER_STRICTNESS=off|soft|strict`.

### 2.5 🟡 Helmet: `crossOriginEmbedderPolicy` standardmäßig aktiv
- **Problem:** Kann das Laden von `fonts.gstatic.com` in manchen Browsern blockieren.
- **Lösung:** Nach Umstellung auf Self-Hosted Fonts prüfen und explizit setzen (`crossOriginEmbedderPolicy: true`).

### 2.6 🟡 HTTPS-Redirect vertraut blind auf `x-forwarded-proto`
- **Problem:** `if (req.headers['x-forwarded-proto'] !== 'https')` funktioniert, aber nur wenn ein Trusted-Proxy davor sitzt. Ohne `app.set('trust proxy', 1)` kann ein Angreifer den Header fälschen.
- **Lösung:** `app.set('trust proxy', 1)` hinzufügen (vor dem Redirect), dokumentieren dass Deploy hinter Render/Railway/Heroku funktioniert.

### 2.7 🟢 `audit` nur `--audit-level=high`
- **Vorschlag:** In CI zusätzlich `npm audit --audit-level=moderate --production` laufen lassen; nur Warnung, nicht fail.

---

## 3. Zuverlässigkeit & Fehlerbehandlung

### 3.1 🔴 `showError` wird als Erfolg **und** als Fehler genutzt
- **Problem:** In `socket-handlers.js` ruft `'player-reconnected'`, `'host-changed'`, `'reconnect'` alle `showError(...)` mit positiven Nachrichten auf („Du bist jetzt der Host!“). CSS stylt das als rot – verwirrend, lenkt von echten Fehlern ab.
- **Lösung:**
  - Neue API `showToast(message, type?: 'info' | 'success' | 'error')` in `dom.js` einführen.
  - Zwei getrennte Container im HTML (`#toast-info`, `#toast-error`), oder eine generische Toast-Komponente mit `role="status"` (info) bzw. `role="alert"` (error).
- **Akzeptanzkriterien:** Positive Nachrichten in grün/neutral, Fehlermeldungen rot.

### 3.2 🟠 Keine `try/catch` rund um Socket-Handler-Calls im Client
- **Problem:** Ein Fehler beim Rendern (z. B. unerwartetes Payload-Format) crasht den ganzen Handler und lässt den User in einem kaputten Zustand zurück.
- **Lösung:** `registerSocketHandlers` wrappt jeden Callback mit `try { ... } catch (e) { logClient(e); showError('Ein unerwarteter Fehler ist aufgetreten.') }`.

### 3.3 🟠 Timer-Drift zwischen Server und Client
- **Problem:** `writing-timer` basiert auf `Date.now() - writingStartTime` clientseitig. Wenn Client-Uhr stark abweicht oder zwischenzeitlich tabwechselt, läuft die UI-Zeit falsch, obwohl Server-Timer unbeirrt tickt.
- **Lösung:** Server schickt alle 5 s ein `timer-sync`-Event mit `remaining`. Client gleicht ab (Drift > 2 s → resync).

### 3.4 🟡 `emitWithTimeout` ist nur Platzhalter
- **Problem:** Funktion in `socket-handlers.js` emit-et einfach und hat kein echtes Timeout. Nutzer erhält bei hängenden Requests nie Feedback.
- **Lösung:** Socket.io `timeout()`-API nutzen: `socket.timeout(5000).emit('submit-story', data, (err, ack) => ...)` und Server-seitig Acks einbauen.

### 3.5 🟡 Lobby-Cleanup aggressiv auf 30 min
- **Problem:** `30 * 60 * 1000` ms = 30 min Inaktivität. Wenn eine Gruppe eine Pause macht (Abendessen), wird die Lobby gelöscht.
- **Lösung:** Konfigurierbar via `LOBBY_IDLE_TIMEOUT_MIN` (Default 60). Während aktiver Phase (Writing/Guessing) den Cleanup pausieren.

---

## 4. Barrierefreiheit (a11y)

### 4.1 🟠 Timer ist für Screenreader unlesbar
- **Problem:** `dom.writingTimerTime` hat `aria-live="off"` – damit werden Zeitupdates nie angekündigt. Gleichzeitig fehlt eine „10 Sekunden verbleibend“-Ansage.
- **Lösung:** Separater `aria-live="polite"` Text (z. B. „Noch 10 Sekunden.“) der nur bei Meilensteinen (60/30/10/5 s) aktualisiert wird. Der eigentliche Timer-Text bleibt `aria-live="off"`.

### 4.2 🟠 Tastaturnavigation im Emoji-Rate-Grid
- **Problem:** `guess-emoji-options` und `guess-player-options` sind `role="radiogroup"` mit `<button>`-Kindern, die **keine** `role="radio"` + `tabindex`-Logik haben. Tab-Taste geht durch alle Buttons, Pfeiltasten machen nichts.
- **Lösung:** Echte Radio-Group-Semantik implementieren: erster Button `tabindex="0"`, Rest `tabindex="-1"`, Pfeiltasten wechseln Fokus und `aria-checked`.

### 4.3 🟡 Fokus-Falle im Tutorial-Modal
- **Problem:** `#tutorial-modal` ist `role="dialog"`, aber Tab-Taste kann den Modal verlassen (Fokus auf Body). Kein Focus-Trap.
- **Lösung:** Kleine `focusTrap(element)`-Utility in `dom.js`, Escape-Taste schließt das Modal. Gleiches für `#replay-modal`.

### 4.4 🟡 Kontrast im Dark-Mode
- **Problem:** `--text-muted: oklch(0.52 0.008 280)` auf `--bg-dark: oklch(0.14 ...)` erreicht ~4.0:1, liegt unter WCAG-AA (4.5:1) für body text.
- **Lösung:** `--text-muted` auf `oklch(0.62 0.008 280)` anheben (schwärzer im Light-Mode entsprechend).

### 4.5 🟡 `alt`-Texte & Tooltips
- **Prüfen:** Alle dekorativen Emojis haben `aria-hidden="true"`. `role="img"` mit `aria-label` nur wo semantisch nötig (Avatar, Score-Medaille).

---

## 5. UX & Design-Politur

### 5.1 🟠 Kein echter Dark/Light-Mode-Toggle
- **Problem:** Theme wird nur via `prefers-color-scheme` geschaltet. User können nicht bewusst wählen.
- **Lösung:**
  - Toggle-Button im Header (☀️/🌙).
  - Preference in `localStorage` (`icontale_theme: 'dark' | 'light' | 'auto'`).
  - CSS mit `[data-theme="light"]`-Overrides statt/zusätzlich zu `@media (prefers-color-scheme)`.

### 5.2 🟠 Fehlermeldungen überschreiben sich gegenseitig
- **Problem:** `showError` setzt `textContent` neu – der vorherige Fehler verschwindet sofort.
- **Lösung:** Siehe 3.1 (Toast-Queue), max 3 gleichzeitig sichtbar, älteste zuerst weg.

### 5.3 🟡 Room-Code kopieren
- **Feature:** Klick auf Room-Code in Lobby kopiert in Zwischenablage, zeigt Bestätigung. Extra „Link kopieren“-Button mit vollständiger URL (`?room=XYZ123`) für einfaches Teilen.
- Serverseitig `GET /?room=XYZ123` vorfüllen (Query-Param wird im Client in `room-code-input` übernommen und Tab umgeschaltet).

### 5.4 🟡 Writing-Phase: Textarea ist zu klein auf Desktop
- **Lösung:** `min-height: 200px` auf Desktop, Autoscale (grow mit Inhalt, max `70vh`).

### 5.5 🟡 Guess-Phase: Emoji-Optionen sind manchmal viele
- **Problem:** Bei `emojiCount=5` und 8 Spielern gibt es bis zu 8 Combos à 5 Emojis – unübersichtlich.
- **Lösung:** Grid mit max 4 Spalten, sortieren nach „übereinstimmende Emojis mit eigener Combo zuletzt“ (bessere Verständlichkeit) oder randomisieren konsistent pro Runde.

### 5.6 🟡 Leaderboard-Tooltip nutzt Mouse-Events
- **Problem:** `onmouseenter/leave` funktioniert nicht auf Touch. Mobile sieht keine Punkte-Erklärung.
- **Lösung:** `aria-expanded` + Klick-Toggle, HTML5 `<details><summary>` als Fallback.

### 5.7 🟢 Konfetti / Feier-Animation beim Game-Over des Siegers
- canvas-confetti (~2 KB) beim `showGameOver` falls eigener Spieler Platz 1.

### 5.8 🟢 „Story-Entwurf“ persistieren
- **Feature:** Während Writing-Phase wird der Textarea-Inhalt alle 2 s in `sessionStorage` gespeichert. Bei Reload wiederherstellen.

---

## 6. Mobile & Responsive

### 6.1 🟠 Timer-Bar-Animation auf Mobile springt
- **Problem:** Im Media-Query < 768 px wird `timer-bar-inner` auf `width: var(--timer-pct, 100%)` gesetzt, aber der JS-Code schreibt `style.height` – nicht `--timer-pct`.
- **Lösung:** In `ui.js → updateWritingTimer` statt `style.height = ...%` die CSS-Variable setzen: `el.style.setProperty('--timer-pct', pct * 100 + '%')` und zwei Regeln (Desktop = height, Mobile = width) beide lesen dieselbe Variable.

### 6.2 🟠 Tabs sind auf Mobile untereinander (unschön)
- **Problem:** `@media (max-width: 768px) { .tabs { flex-direction: column } }` macht Tabs zu zwei großen Reihen-Buttons. Besser bleiben als Segmented Control.
- **Lösung:** Auf Mobile `flex-direction: row` behalten, aber Label kürzen („Erstellen“/„Beitreten“) oder Icons-only.

### 6.3 🟡 Virtuelle Tastatur überdeckt Submit-Button
- **Lösung:** In Writing/Guess-Phase `scrollIntoView({ block: 'nearest' })` nach Fokus, oder Submit-Button als „sticky footer“.

### 6.4 🟡 Haptisches Feedback
- `navigator.vibrate(10)` bei richtigem/falschem Tipp auf Mobile.

---

## 7. PWA & Offline

### 7.1 🟠 Service-Worker cached falsche Asset-Liste
- **Problem:** `sw.js` listet `/js/replay.js` **nicht** auf, obwohl das Modul vom Main-Entry importiert wird. Offline ist `replay.js` nicht verfügbar.
- **Lösung:** `replay.js` ergänzen; Liste automatisch aus einem Manifest generieren (Build-Script).

### 7.2 🟠 „Network first“ für Socket.io, aber nicht für API
- **Lösung:** `/replay/:id` und `/health` sollten explizit übersprungen (network-only) oder mit `stale-while-revalidate` behandelt werden.

### 7.3 🟡 `sw.js` Versions-Handling
- **Problem:** Cache-Name ist hardgecoded `icontale-v3`. Bei jedem Deploy muss das erhöht werden, sonst halten Nutzer alte Bundles.
- **Lösung:** In Build-Step `CACHE_NAME` mit git-sha oder `package.json`-Version ersetzen.

### 7.4 🟡 Screenshots im Manifest
- Aktuell nur `og-image.png` als Wide-Screenshot. `narrow`-Screenshot für mobile PWA-Install-Prompt fehlt.
- Zwei echte In-Game-Screenshots (Lobby + Writing) liefern, Manifest auf 1080×1920 ergänzen.

### 7.5 🟡 `start_url` mit Tracking
- `start_url: "/?utm=pwa"` zur Messung wie oft Users via installiertem PWA kommen.

---

## 8. Code-Qualität & Architektur

### 8.1 🟠 Duplikat: `server.js` und `server.ts`
- **Problem:** Beide liegen im Repo. `server.js` (43 KB) ist offenbar ein alter Artefakt – `package.json` erwartet nur `dist/server.js`.
- **Lösung:** `server.js` löschen (steht außerdem unter `main` von `package.json`, was auf `dist/server.js` zeigt → inkonsistent).

### 8.2 🟠 TypeScript nur server-side
- **Problem:** Die Client-Module (`public/js/*.js`) sind plain JS mit JSDoc, aber viele `@param`-Typen fehlen.
- **Lösung:** 
  - Option A (leichtgewichtig): `tsconfig.json` mit `allowJs: true, checkJs: true, noEmit: true` für `public/js/**`, in CI `tsc --noEmit` laufen lassen.
  - Option B (groß): Frontend komplett auf TS migrieren.
- **Empfehlung:** Option A, ohne Build-Schritt.

### 8.3 🟠 `public/js/socket-handlers.js` mischt State, DOM und Flow
- **Problem:** Ein 271 LOC Handler-File macht DOM-Updates, State-Änderungen und Timer-Cleanup. Schwierig zu testen.
- **Lösung:** Handlers nur noch Events → Store-Aktionen dispatchen (mini Redux/Signal). UI reagiert reaktiv auf State-Änderungen.

### 8.4 🟠 Inkonsistente Namenskonventionen Server ↔ Client
- Server-Event `results-progress` trägt `currentChatIdx`, aber Lobby-Events nutzen `currentRound`. `camelCase` ist konsistent, aber die **Event-Namen** sind `kebab-case`, während interne Felder unterschiedlich. Dokument `SOCKET_API.md` + automatisierter Typen-Export aus `lib/types.ts` → `public/js/types.d.ts`.

### 8.5 🟡 Keine `eslint-plugin-security` / `-promise`
- In `eslint.config.js` ergänzen.

### 8.6 🟡 Prettier-Config ist minimal
- `.prettierrc` prüfen; Einheitliches Printwidth, SingleQuote, TabWidth=2 (aktuell 4, sollte konsistent dokumentiert sein).

### 8.7 🟢 `scripts/generate-icons.js` nutzt `canvas` (nativ, Build-Abhängigkeit)
- **Problem:** `canvas` braucht libcairo etc. auf dem Build-System. Einmal generieren und PNGs ins Repo committen reicht.
- **Lösung:** `canvas` nach `optionalDependencies` verschieben. `npm run build:icons` nur manuell, nicht im Docker-Build.

### 8.8 🟢 `ts-node`/`tsx` nur in dev
- Prod läuft auf kompiliertem JS → OK. Dockerfile prüfen: Kein `tsx` im Runtime-Image.

---

## 9. Feature-Ideen

### 9.1 🟡 Emoji-Reaktionen in der Results-Phase
- Während Chat-Replay die anderen Spieler mit 😂/😮/❤️ reagieren lassen (bubble oben neben Avatar). Erhöht Stimmung.

### 9.2 🟡 Private vs. Public Lobbies
- Aktuell jede Lobby privat via Code. Optional `public: true` Setting → Landing-Seite mit offenen Lobbies (max 5 sichtbar, Anti-Spam per Rate-Limit).

### 9.3 🟡 „Verrückter Schreibmodus“ / Constraints
- Beispiel: „Schreibe ohne Buchstabe E“, „Max 5 Wörter“, „Nur Fragen“. Würfel bei Start der Runde.

### 9.4 🟡 Voting-Phase
- Nach Ergebnissen: „Beste Geschichte“ wählen – Extrapunkte für Gewinner der Publikumsabstimmung.

### 9.5 🟢 Statistiken & Profile
- Mit Redis bereits halb möglich (Achievements + Stats). Profil-Seite `/profile/:sessionHash` mit Siege, Lieblingsmodus, beste Geschichte.

### 9.6 🟢 Exportierbare Geschichten
- Am Ende einer Runde „Geschichten als PDF/Markdown herunterladen“ (Story-Book-Funktion).

### 9.7 🟢 Beobachter-Chat
- Spectators können sich untereinander chatten (stumm für Spieler), damit sie nicht spoilern.

---

## 10. Internationalisierung (i18n)

### 10.1 🟠 Hardcoded Deutsch überall
- **Problem:** UI- und Server-Strings (Fehlermeldungen, Mode-Namen) sind in Deutsch fest verdrahtet.
- **Lösung:**
  - Zentrale `locales/de.json` + `locales/en.json`.
  - Minimalistisches `t(key, vars)` im Client (`public/js/i18n.js`) und im Server (`lib/i18n.ts`).
  - `<html lang>` dynamisch setzen.
  - Zumindest **Englisch** als zweite Sprache einführen, damit internationale User teilnehmen können.

### 10.2 🟡 Emoji-Namen mehrsprachig
- `EMOJI_NAMES` in der JSON-Locale-Datei pflegen.

---

## 11. Observability & Ops

### 11.1 🟠 Kein strukturiertes Error-Tracking
- **Lösung:** [Sentry](https://sentry.io/) für Server (Pino Transport) und Client (kleiner JS-Snippet). DSN via Env. 50-100 Zeilen Integration.

### 11.2 🟡 Metrics-Endpoint
- `/metrics` im Prometheus-Format (lobbies_active, players_online, messages_per_min). Nutze [`prom-client`](https://www.npmjs.com/package/prom-client).

### 11.3 🟡 Healthcheck erweitern
- Aktuell prüft `/health` nur Uptime & Lobby-Count. Optional: Redis-Ping, letzte Socket-Connect-Zeit, Node-Heap-Nutzung.

### 11.4 🟡 Graceful Shutdown
- Prüfen: Sendet `server-shutdown` an alle Sockets, aber wartet aktuell (in `server.ts`) nicht auf `io.close()` → Socket-Tests können flaky werden.
- In-Flight-Games persistieren (bereits über Redis) und Reconnect-Hinweis an Clients senden.

### 11.5 🟢 Feature-Flags
- `FEATURE_TEAM_MODE`, `FEATURE_REPLAYS` via Env, damit einzelne Features im Staging deaktivierbar sind.

---

## 12. Tests & CI

### 12.1 🟠 E2E-Tests simulieren nur Node-Client, nicht Browser
- **Problem:** `__tests__/e2e.test.js` nutzt `socket.io-client` – testet Server, aber kein reales DOM.
- **Lösung:** [Playwright](https://playwright.dev) Setup für 1-2 kritische Flows (Lobby erstellen → Spiel starten → Ergebnis). In CI als separater Job.

### 12.2 🟠 Keine Coverage-Schwelle erzwungen
- `vitest.config.js` hat `coverage.include`, aber keinen `thresholds`-Block. Ziel: Lines 80 %, Branches 70 %.

### 12.3 🟡 Test für Mehrsprachigkeit
- Sicherstellen, dass alle t-Keys in de **und** en existieren (einfacher JSON-Diff-Test).

### 12.4 🟡 Mutation Tests
- Für `lib/scoring.ts` Stryker einführen – sicherstellen, dass Tests die Scoring-Logik tatsächlich decken.

### 12.5 🟢 Dependabot / Renovate
- `renovate.json` mit geplanten Updates (Gruppieren, nicht-kritisches alle 2 Wochen).

### 12.6 🟢 Lint-Staged + Husky Pre-Commit
- Prettier + ESLint nur auf geänderten Dateien, verhindert dreckige Commits.

---

## 13. Dokumentation & Meta

### 13.1 🟡 README „Testing“-Abschnitt unvollständig
- Aktuell steht nur `npm test` + zwei Bullet-Points. Ziel: Test-Pyramide kurz erklären, Coverage-Report-Link.

### 13.2 🟡 `ARCHITECTURE.md`
- Sequenzdiagramm (Mermaid) der Socket-Events pro Phase. Hilft neuen Contributors enorm.

### 13.3 🟡 `SECURITY.md`
- Bug-Bounty-Kontakt, Disclosure-Policy, unterstützte Versionen.

### 13.4 🟢 Screenshots aktualisieren
- README-Preview zeigt `og-image.png`; dieses Bild ist vermutlich veraltet (nach Redesign). Frische Screenshots aus v3 beilegen.

### 13.5 🟢 Demo-GIF / Loom
- 30 s animiertes GIF eines kompletten Spielflusses. Wirkt Wunder für erste Eindrücke.

### 13.6 🟢 CONTRIBUTING: „Good First Issue“-Liste
- Bei GitHub Issues eröffnen + Label. Verbindet mit diesem Plan.

---

## 14. Vorgeschlagene Reihenfolge der PRs

Empfohlene Reihenfolge – **top-down** abarbeitbar, jede PR ≤ ~300 LOC Diff:

| # | Branch / PR | Inhalt | Kategorie | Prio |
|---|---|---|---|---|
| 1 | `cursor/chore-remove-legacy-server-js` | Entfernt `server.js`-Artefakt, prüft `package.json.main` | 8.1 | 🟠 |
| 2 | `cursor/perf-shrink-og-image` | OG-Image verkleinern, aus SW entfernen, WebP-Fallback | 1.1, 7.1 | 🔴 |
| 3 | `cursor/perf-self-host-fonts` | Inter self-hosten, CSP verschärfen | 1.3, 2.1 | 🟠 |
| 4 | `cursor/perf-prod-minified-css` | `styles.min.css` in Prod ausliefern + Build-Step | 1.2 | 🟠 |
| 5 | `cursor/feat-toast-system` | Unified Toast (info/success/error) statt `showError` | 3.1, 5.2 | 🟠 |
| 6 | `cursor/feat-theme-toggle` | Manual Dark/Light-Mode-Toggle | 5.1 | 🟠 |
| 7 | `cursor/a11y-timer-liveregions` | Screen-Reader-Timer + Focus-Trap im Modal | 4.1, 4.3 | 🟠 |
| 8 | `cursor/a11y-radiogroups` | Pfeiltasten-Navigation in Radio-Groups | 4.2 | 🟠 |
| 9 | `cursor/feat-roomcode-share` | Kopier-Button, `?room=`-Deeplink | 5.3 | 🟡 |
| 10 | `cursor/fix-sw-missing-replay-js` | Service-Worker-Manifest vervollständigen | 7.1 | 🟠 |
| 11 | `cursor/feat-draft-autosave` | Story-Entwurf in sessionStorage | 5.8 | 🟢 |
| 12 | `cursor/refactor-types-for-client` | `checkJs` + JSDoc-Typen, shared types.d.ts | 8.2 | 🟠 |
| 13 | `cursor/feat-i18n-foundation` | i18n-System + Englisch | 10.1 | 🟠 |
| 14 | `cursor/chore-observability-sentry` | Sentry/Prometheus-Metrics | 11.1, 11.2 | 🟡 |
| 15 | `cursor/ci-playwright-smoke` | Playwright E2E für Lobby-Flow | 12.1 | 🟡 |

Die restlichen Punkte aus Abschnitten 1–13 können als kleinere Follow-ups folgen.

---

## Messgrößen für Erfolg

| Metrik | Baseline (aktuell) | Ziel |
|---|---|---|
| Lighthouse Performance (Mobile) | ~ 75 | **≥ 95** |
| Lighthouse A11y | ~ 88 | **100** |
| First Contentful Paint (3G Fast) | ~ 2.4 s | **< 1.5 s** |
| Service-Worker-Shell-Cache | 5.4 MB | **< 500 KB** |
| CSP Score (Mozilla Observatory) | B | **A+** |
| Test Coverage (Lines) | unbek. | **≥ 80 %** |
| i18n-Sprachen | 1 (de) | **≥ 2 (de, en)** |

---

_Erstellt am 2026-04-23. Änderungen & Ergänzungen bitte per PR gegen dieses Dokument._

# 💶 Finanzapp

Finanzen schnell und einfach tracken – direkt am Handy, mit **Fotos von Rechnungen und Kassenbons**.

### Erfassen
- **📷 Beleg scannen:** Foto machen → Betrag, Datum, Händler und Kategorie werden automatisch erkannt (Texterkennung läuft direkt auf dem Gerät, nichts wird hochgeladen). Liegt die Erkennung daneben, kannst du einen anderen Betrag vom Bon mit einem Tipp übernehmen.
- **＋ Schnelle Eingabe** mit **Rechner** im Betragsfeld (`12,50+3,20` oder `3*2,50`).
- **⚡ Häufige Buchungen** (z. B. „Kaffee 3,20 €“) mit einem Tipp übernehmen.
- **Lernt mit:** Händler-Vorschläge beim Tippen, und die App merkt sich, welche Kategorie du für welchen Händler nimmst.
- **Duplikat-Warnung**, wenn du dieselbe Buchung zweimal erfasst, und **„Rückgängig“** nach dem Löschen.

### Übersicht (🏠)
- Ausgaben, Einnahmen, Saldo des Monats, **Vergleich mit dem Vormonat** (fair bis zum gleichen Tag).
- Gesamtbudget mit „noch X € pro Tag“, Ausgaben nach Kategorie (antippen zum Filtern).
- **Suche** über alle Buchungen. Monat wechseln mit ‹ ›, durch Wischen oder Tippen auf den Monatsnamen (zurück zu heute).

### Statistik (📊)
- Kennzahlen: Ø pro Tag, Sparquote, größte Ausgabe, Fixkosten pro Monat.
- Einnahmen & Ausgaben der letzten 12 Monate, Ausgabenverlauf im Monat im Vergleich zum Vormonat und zum Budget-Plan.
- Wo das meiste Geld hingeht (Top-Händler) und Jahresüberblick.

### Planen (🗓️)
- **Budgets** gesamt und pro Kategorie, mit Warnung bei 80 % und bei Überschreitung.
- **Fixkosten & Daueraufträge** (Miete, Abos, Gehalt …) – werden am Fälligkeitstag automatisch gebucht. Jede Buchung lässt sich per 🔁 in Fixkosten umwandeln.
- **Sparziele** mit Fortschritt und „so viel pro Monat bis zum Termin“.

### Einstellungen (⚙︎)
- Hell / Dunkel / Automatisch, eigene Kategorien, Texterkennung an/aus.
- CSV-Export (Monat oder alles) für Excel/Numbers, Backup & Wiederherstellung inkl. Belegfotos, Fixkosten und Sparzielen, Backup-Erinnerung nach 30 Tagen.
- **Offline-fähig & privat:** Alle Daten bleiben im Browser auf deinem Gerät (IndexedDB). Kein Konto, kein Server.

## Auf dem Handy nutzen

Die App ist eine reine Web-App (PWA) und lässt sich kostenlos über **GitHub Pages** hosten:

1. Diesen Stand in `main` mergen.
2. Auf GitHub: **Settings → Pages → Source: „Deploy from a branch“**, Branch `main`, Ordner `/ (root)` → Speichern.
3. Nach ca. 1 Minute ist die App unter `https://<dein-github-name>.github.io/finanzapp/` erreichbar.
4. Am Handy öffnen und zum Home-Bildschirm hinzufügen:
   - **iPhone (Safari):** Teilen-Symbol → „Zum Home-Bildschirm“
   - **Android (Chrome):** Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“

Danach startet sie wie eine normale App, auch offline. Die Texterkennung lädt beim ersten Scan einmalig ca. 10–15 MB (am besten im WLAN) und funktioniert danach auch offline.

> ⚠️ Die Daten liegen nur auf dem jeweiligen Gerät/Browser. Ab und zu über ⚙︎ → „Backup herunterladen“ sichern.

## Tipps für gute Scans

- Bon flach hinlegen, gut ausleuchten, möglichst nur den Bon im Bild.
- Erkannte Werte kurz prüfen – bei zerknitterten oder verblassten Bons lieber den Betrag schnell selbst eintippen.

## Entwicklung

Keine Build-Tools nötig – reines HTML/CSS/JavaScript (ES-Module).

```bash
npm start   # lokaler Server auf http://localhost:8080
npm test    # Tests für Belegerkennung, Rechner, Fixkosten und Auswertungen (Node 20+)
```

| Datei | Inhalt |
| --- | --- |
| `index.html`, `styles.css` | Oberfläche |
| `js/app.js` | Start, Tabs, Monatsnavigation |
| `js/view-home.js`, `js/view-stats.js`, `js/view-plan.js` | Die drei Bereiche |
| `js/txform.js` | Buchungsformular inkl. Foto & Texterkennung |
| `js/settings.js` | Einstellungen, Export, Backup |
| `js/store.js` | App-Zustand und alle Datenänderungen |
| `js/parser.js` | Betrags-Rechner, Belegerkennung (Betrag, Datum, Händler, Kategorie) |
| `js/recurring.js` | Fixkosten-Termine |
| `js/stats.js` | Auswertungen |
| `js/charts.js` | SVG-Diagramme |
| `js/ocr.js` | Texterkennung mit [Tesseract.js](https://github.com/naptha/tesseract.js) (wird bei Bedarf geladen) |
| `js/db.js` | Speicherung in IndexedDB |
| `js/categories.js`, `js/ui.js` | Kategorien, Hilfsfunktionen |
| `sw.js`, `manifest.webmanifest` | Offline-Modus & Installierbarkeit |

Nach Änderungen an App-Dateien die Versionsnummer `CACHE` in `sw.js` erhöhen, damit installierte Apps das Update laden.

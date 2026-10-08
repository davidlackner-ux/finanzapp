# 💶 Finanzapp

Finanzen schnell und einfach tracken – direkt am Handy, mit **Fotos von Rechnungen und Kassenbons**.

- **📷 Beleg scannen:** Foto machen → Betrag, Datum, Händler und Kategorie werden automatisch erkannt (Texterkennung läuft direkt auf dem Gerät, nichts wird hochgeladen).
- **＋ Schnelle Eingabe:** Betrag tippen, Kategorie antippen, fertig.
- **Monatsübersicht:** Ausgaben, Einnahmen, Saldo und Ausgaben nach Kategorie (antippen zum Filtern).
- **Monatsbudget:** mit Fortschrittsbalken und „noch X € pro Tag“.
- **Export:** CSV für Excel/Numbers sowie Backup/Wiederherstellung als JSON (inkl. Belegfotos).
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
npm test    # Tests für Betrags- und Belegerkennung (Node 20+)
```

| Datei | Inhalt |
| --- | --- |
| `index.html`, `styles.css` | Oberfläche |
| `js/app.js` | App-Logik, Formulare, Übersicht, Export |
| `js/parser.js` | Erkennt Betrag, Datum, Händler, Kategorie aus dem Belegtext |
| `js/ocr.js` | Texterkennung mit [Tesseract.js](https://github.com/naptha/tesseract.js) (wird bei Bedarf geladen) |
| `js/db.js` | Speicherung in IndexedDB |
| `js/categories.js` | Kategorien |
| `sw.js`, `manifest.webmanifest` | Offline-Modus & Installierbarkeit |

Nach Änderungen an App-Dateien die Versionsnummer `CACHE` in `sw.js` erhöhen, damit installierte Apps das Update laden.

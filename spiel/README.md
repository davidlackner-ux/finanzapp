# 🚀 Astro Hüpfer

Ein simples Ein-Finger-Spiel: Tippen, um zu fliegen, durch die Asteroiden-Tore steuern, Münzen sammeln.

```
spiel/
├── www/                  ← das eigentliche Spiel (HTML/JS, läuft im Browser und in der App)
├── ios/                  ← Xcode-Projekt für das iPhone (Capacitor)
├── assets/               ← Quellbilder für App-Icon und Startbildschirm
├── capacitor.config.json ← App-Name und Bundle-ID
└── package.json
```

## Weg 1: Kostenlos als Web-App aufs iPhone (ohne App Store)

1. Branch in `main` mergen und GitHub Pages aktivieren (siehe Haupt-README).
2. Am iPhone in Safari öffnen: `https://<dein-github-name>.github.io/finanzapp/spiel/www/`
3. Teilen-Symbol → **„Zum Home-Bildschirm“**.

Das Spiel startet dann im Vollbild mit eigenem Icon und läuft auch offline.

## Weg 2: Echte App im App Store

### Was du brauchst

| | |
|---|---|
| **Apple Developer Program** | 99 € pro Jahr, Anmeldung unter developer.apple.com/programs (Apple-ID mit Zwei-Faktor-Schutz) |
| **Ein Mac mit Xcode** | Xcode ist kostenlos im Mac App Store. Ohne Mac: Cloud-Dienst wie Codemagic (mit kostenlosem Kontingent) |
| **Node.js** | nodejs.org, für die Befehle unten |
| **Eine Datenschutz-URL** | Pflicht für jede App. Das Spiel speichert nur Rekord und Münzen auf dem Gerät und sammelt keine Daten. Eine kurze Seite reicht, z. B. auf GitHub Pages |

### Schritte auf dem Mac

```bash
cd spiel
npm install          # einmalig
npm run ios          # kopiert das Spiel ins Xcode-Projekt und öffnet Xcode
```

In Xcode:

1. Links auf **App** klicken → Reiter **Signing & Capabilities** → bei **Team** deinen Developer-Account wählen.
2. **Bundle Identifier** prüfen (aktuell `app.astrohuepfer.game`). Kann nach dem ersten Upload **nicht mehr geändert werden**, also vorher endgültig festlegen (auch in `capacitor.config.json`).
3. iPhone per Kabel anschließen, oben als Ziel auswählen und ▶ drücken → das Spiel läuft als App auf deinem Handy.
4. Zum Hochladen: oben **Any iOS Device** wählen → Menü **Product → Archive** → **Distribute App** → **App Store Connect**.

Nach jeder Änderung am Spiel (`www/`) wieder `npm run ios` ausführen.
Neues Icon: `assets/icon-only.png` (1024×1024, ohne Transparenz) ersetzen und `npm run icons` ausführen.

### In App Store Connect (appstoreconnect.apple.com)

1. **Meine Apps → + → Neue App**: Name (muss im App Store einzigartig sein), Sprache Deutsch, Bundle-ID auswählen.
2. **Screenshots**: mindestens 3 Stück im 6,9-Zoll-Format (1320 × 2868). Am einfachsten im iOS-Simulator „iPhone 16 Pro Max“ mit ⌘S.
3. **Texte**: Untertitel, Beschreibung, Keywords, Support-URL, Datenschutz-URL.
4. **Kategorie**: Spiele → Arcade. **Altersfreigabe**: Fragebogen ausfüllen (ergibt 4+).
5. **App-Datenschutz**: „Keine Daten erfasst“.
6. **EU-Händlerstatus (DSA)**: Wer mit der App Geld verdient, gilt als Händler, und dann werden **Adresse und Telefonnummer öffentlich** im App Store angezeigt. Für ein kostenloses Hobby-Spiel ohne Werbung kann man in der Regel „kein Händler“ angeben.
7. Hochgeladenen Build auswählen → **Zur Prüfung einreichen**. Apple prüft meist innerhalb von 1–3 Tagen.

Tipp: Vor der Veröffentlichung über **TestFlight** an Freunde verteilen und Feedback holen.

### Worauf Apple bei der Prüfung achtet

- **Keine Kopie**: Apple lehnt reine Flappy-Bird-Klone ab (Richtlinie 4.3 „Spam“). Eigener Name, eigene Grafik und eigene Ideen (Münzen, Combos, Medaillen) helfen. Ein Shop mit freischaltbaren Raketen würde das Spiel noch klarer abheben.
- **Kein „Flappy“** im Namen, in der Beschreibung oder in den Keywords.
- Das Spiel muss ohne Abstürze laufen und offline funktionieren (tut es).

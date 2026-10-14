# 🚀 Astro Hüpfer

Ein simples Ein-Finger-Spiel: Tippen, um zu fliegen, durch die Asteroiden-Tore steuern, Münzen sammeln.

```
spiel/
├── www/                  ← das Spiel (läuft im Browser und in der App)
│   ├── datenschutz.html  ← Datenschutzerklärung (Pflicht für den App Store)
│   └── support.html      ← Hilfe & Kontakt (Pflicht für den App Store)
├── ios/                  ← Xcode-Projekt für das iPhone (Capacitor)
├── store/                ← Screenshots und Texte für den App-Store-Eintrag
├── assets/               ← Quellbilder für App-Icon und Startbildschirm
├── capacitor.config.json ← App-Name und Bundle-ID
└── package.json          ← Versionsnummer der App ("version")
```

Gebaut wird die iPhone-App von GitHub in der Cloud: `.github/workflows/ios-app.yml`.

---

## Weg 1: Kostenlos als Web-App aufs iPhone (ohne App Store)

GitHub Pages ist für dieses Repository schon eingeschaltet.

1. Diesen Branch in `main` mergen.
2. Am iPhone in **Safari** öffnen: `https://davidlackner-ux.github.io/finanzapp/spiel/www/`
3. Teilen-Symbol → **„Zum Home-Bildschirm“**.

Das Spiel startet dann im Vollbild mit eigenem Icon und läuft auch offline.

---

## Weg 2: Echte App im App Store – ohne Mac

Du brauchst nur deinen **Windows-PC**, dein **iPhone** und einen Browser. Die iPhone-App wird auf einem Mac von GitHub gebaut, signiert und direkt zu Apple hochgeladen. Für öffentliche Repositorys ist das kostenlos.

| Was | Kosten |
|---|---|
| Apple Developer Program | 99 € pro Jahr |
| GitHub (Mac in der Cloud) | kostenlos (öffentliches Repository) |

Einmalig rechne mit etwa 1–2 Stunden Einrichtung, dazu 1–2 Tage Wartezeit auf Apple (Freischaltung des Accounts und App-Prüfung).

### Schritt 0: Branch in `main` mergen

Den „Run workflow“-Knopf zeigt GitHub nur für Workflows im Haupt-Branch `main` an. Deshalb zuerst diesen Branch in `main` mergen.

### Schritt 1: Apple Developer Program beitreten

Am einfachsten mit der App **„Apple Developer“** auf deinem iPhone (aus dem App Store) → **Konto** → **Jetzt registrieren**. Alternativ im Browser unter developer.apple.com/programs/enroll.

- Du brauchst eine Apple-ID mit Zwei-Faktor-Authentifizierung und musst volljährig sein.
- Melde dich als **Einzelperson** an. Dein echter Name erscheint dann im App Store als Anbieter.
- Die Freischaltung dauert meist ein paar Stunden bis zwei Tage.

### Schritt 2: Bundle-ID registrieren

Die Bundle-ID ist der eindeutige technische Name der App. Sie lautet `app.astrohuepfer.game` und **kann später nicht mehr geändert werden**. Willst du einen anderen Namen, sag vorher Bescheid, dann passe ich sie im Projekt an.

1. developer.apple.com/account → **Certificates, IDs & Profiles** → **Identifiers** → **+**
2. **App IDs** → **App** → Weiter
3. Description: `Astro Hüpfer`, Bundle ID: **Explicit** → `app.astrohuepfer.game`
4. Keine Capabilities anhaken → **Continue** → **Register**

### Schritt 3: App in App Store Connect anlegen

1. appstoreconnect.apple.com → **Apps** → **+** → **Neue App**
2. Plattform **iOS**, Name `Astro Hüpfer`, Primärsprache **Deutsch**, Bundle-ID aus Schritt 2 auswählen, SKU z. B. `astrohuepfer`, Zugriff **Uneingeschränkt**.

Ist der Name schon vergeben, meldet App Store Connect das hier sofort.

### Schritt 4: API-Schlüssel für GitHub erstellen

Mit diesem Schlüssel darf GitHub in deinem Namen die App signieren und hochladen.

1. App Store Connect → **Benutzer und Zugriff** → Reiter **Integrationen** → **App Store Connect API** → **Teamschlüssel**
2. Beim ersten Mal **Zugriff anfordern** bestätigen.
3. **+** → Name `GitHub`, Zugriff **Admin** → **Generieren**
4. **API-Schlüssel laden** → eine Datei `AuthKey_XXXXXXXXXX.p8` wird heruntergeladen. **Das geht nur ein einziges Mal**, also gut aufheben.
5. Notiere dir die **Schlüssel-ID** (in der Tabelle) und die **Aussteller-ID** (Issuer ID, oben über der Tabelle).
6. Deine **Team-ID** findest du unter developer.apple.com/account → **Mitgliedschaftsdetails**.

> Warum „Admin“? Nur damit darf GitHub das Verteilungszertifikat automatisch in Apples Cloud anlegen. Gib diesen Schlüssel niemals weiter und lade ihn nie ins Repository hoch.

### Schritt 5: Secrets bei GitHub eintragen

Im Repository auf github.com: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Lege diese vier an:

| Name | Inhalt |
|---|---|
| `ASC_KEY_ID` | die Schlüssel-ID aus Schritt 4 |
| `ASC_ISSUER_ID` | die Aussteller-ID aus Schritt 4 |
| `ASC_KEY_P8` | die .p8-Datei mit dem **Editor** öffnen und den **kompletten Inhalt** einfügen, inklusive der Zeilen `-----BEGIN PRIVATE KEY-----` und `-----END PRIVATE KEY-----` |
| `APPLE_TEAM_ID` | die Team-ID aus Schritt 4 |

Secrets sind verschlüsselt und auch in einem öffentlichen Repository für niemanden sichtbar.

### Schritt 6: App bauen und hochladen

1. Im Repository: **Actions** → links **iOS-App** → **Run workflow** → Branch `main` → **Run workflow**.
2. Nach etwa 5–10 Minuten ist der Lauf grün. In der Zusammenfassung steht „Version … wurde zu App Store Connect hochgeladen“.
3. Apple verarbeitet den Build danach noch 10–30 Minuten. Du bekommst eine E-Mail, sobald er bereit ist.

Ist der Lauf rot, klick ihn an und schau dir den roten Schritt an. Oder sag mir einfach Bescheid, ich kann die Logs lesen und den Fehler beheben.

### Schritt 7: Auf deinem iPhone testen

1. App Store Connect → deine App → **TestFlight** → **Interne Tests** → Gruppe anlegen → dich selbst hinzufügen.
2. Auf dem iPhone die App **TestFlight** installieren und die Einladung annehmen.
3. Spielen und prüfen: Ton, Vibration, Notch, Pause beim App-Wechsel.

### Schritt 8: Store-Eintrag ausfüllen

**Vorher:** In `www/datenschutz.html` und `www/support.html` die gelb markierten Platzhalter durch deinen Namen und deine E-Mail-Adresse ersetzen und in `main` übernehmen. Die Seiten sind dann unter den URLs aus `store/app-store-texte.md` erreichbar.

Dann in App Store Connect bei deiner App:

1. **Screenshots**: die 4 Bilder aus `store/screenshots/` beim iPhone mit **6,9 Zoll** hochladen.
2. **Texte**: Untertitel, Werbetext, Beschreibung, Keywords, Support-URL, Copyright aus `store/app-store-texte.md` kopieren.
3. **App-Informationen**: Kategorie Spiele → Arcade, Altersfreigabe-Fragebogen ausfüllen (überall „Keine“/„Nein“), Datenschutz-URL eintragen.
4. **App-Datenschutz**: „Wir erfassen keine Daten von dieser App“.
5. **Preise und Verfügbarkeit**: Kostenlos, alle Länder.
6. **EU-Händlerstatus (Digital Services Act)**: Wer mit der App Geld verdient, gilt als Händler, und dann werden **Adresse und Telefonnummer öffentlich** im App Store angezeigt. Für ein kostenloses Hobby-Spiel ohne Werbung kann man in der Regel „kein Händler“ angeben.
7. Bei **Build** den hochgeladenen Build auswählen.

### Schritt 9: Zur Prüfung einreichen

**Zur Prüfung hinzufügen** → **Zur App-Prüfung einreichen**. Apple prüft meist innerhalb von 1–3 Tagen. Danach kannst du die App sofort oder zu einem Wunschtermin veröffentlichen.

### Updates veröffentlichen

1. Spiel in `www/` ändern.
2. In `package.json` die `"version"` erhöhen, z. B. von `1.0.0` auf `1.0.1`.
3. Workflow wie in Schritt 6 starten, dann in App Store Connect eine neue Version anlegen und einreichen.

Die Build-Nummer zählt GitHub automatisch hoch.

### Worauf Apple bei der Prüfung achtet

- **Keine Kopie**: Apple lehnt reine Flappy-Bird-Klone ab (Richtlinie 4.3 „Spam“). Eigener Name, eigene Grafik und eigene Ideen (Münzen, Combos, Medaillen) helfen. Ein Shop mit freischaltbaren Raketen würde das Spiel noch klarer abheben.
- **Kein „Flappy“** im Namen, in der Beschreibung oder in den Keywords.
- Das Spiel muss ohne Abstürze laufen und offline funktionieren (tut es).

---

## Für später: mit einem Mac

Wer doch einen Mac hat, kann das Projekt auch lokal öffnen:

```bash
cd spiel
npm install
npm run ios      # kopiert das Spiel ins Xcode-Projekt und öffnet Xcode
npm run icons    # nach Änderung von assets/icon-only.png (1024 × 1024, ohne Transparenz)
```

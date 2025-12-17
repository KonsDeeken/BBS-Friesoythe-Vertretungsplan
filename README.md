# BBS Friesoythe Vertretungsplan

Ein moderner und benutzerfreundlicher Vertretungsplan für die BBS Friesoythe. Die Anwendung zeigt Vertretungen für heute und morgen an und ermöglicht das Filtern nach Kursen.

🌐 **Projektseite:** [bbs.deeken.digital](https://bbs.deeken.digital)

## Über das Projekt

Dieses Projekt wurde von **DeekenDigital by Konstantin Deeken** entwickelt und wird kontinuierlich gepflegt. Es bietet eine moderne, responsive Lösung zur Anzeige von Vertretungsplänen der BBS Friesoythe.

## Features

- 🔄 **Automatische Aktualisierung** der Vertretungsdaten alle 10 Minuten
- 📱 **Responsive Design** für alle Geräte (Desktop, Tablet, Mobile)
- 🎯 **Kursfilter** mit Speicherung der letzten Auswahl im LocalStorage
- 📅 **Flexible Ansichten**: Einzelnes Datum oder 4 Schultage kombiniert
- 📆 **Custom Date Picker** mit Wochenende-Erkennung und Schultag-Berechnung
- 🔍 **Sortierbare Tabellenansicht** nach verschiedenen Spalten (Kurs, Tag, Stunde, Raum, Lehrer, Typ, Notizen)
- 🌙 **Klares, augenschonendes Design** mit modernen UI-Elementen
- ⚡ **Schnelle Performance** durch optimiertes Scraping und Caching
- 🔗 **URL-basierte Filterung** für einfaches Teilen von Kursfiltern und Datumsauswahl
- 🕐 **Intelligente Zeiterkennung**: Automatische Umschaltung auf nächsten Tag ab 17:00 Uhr
- 📚 **4-Tage-Ansicht**: Zeigt die nächsten 4 Schultage gleichzeitig an
- 🗑️ **Automatische Bereinigung**: Alte temporäre Dateien werden automatisch gelöscht

## Technologien

### Frontend
- **HTML5** - Semantische Struktur
- **CSS3** - Modernes Styling mit CSS Grid, Flexbox und Custom Properties
- **Vanilla JavaScript** - Keine Frameworks, optimale Performance

### Backend
- **Node.js** (Version 14.0.0 oder höher) - Serverumgebung
- **Express** (v5.1.0) - Web-Framework für API-Endpunkte
- **Puppeteer** (v24.7.2) - Headless Browser für Web Scraping
- **CORS** (v2.8.5) - Cross-Origin Resource Sharing
- **Cheerio** (v1.0.0) - Server-seitiges HTML-Parsing
- **Axios** (v1.8.4) - HTTP-Client für API-Anfragen

## Installation

### Voraussetzungen

- Node.js (Version 14.0.0 oder höher)
- npm (Node Package Manager)

### Setup

1. **Repository klonen:**
```bash
git clone https://github.com/KonsDeeken/BBS-Friesoythe-Vertretungsplan.git
cd BBS-Friesoythe-Vertretungsplan
```

**Alternative Repository-URL** (falls die obige nicht funktioniert):
```bash
git clone https://github.com/KonsDeeken/BBS-Friesoythe-Vertretungsplan.git
cd BBS-Friesoythe-Vertretungsplan
```

2. **Dependencies installieren:**
```bash
npm install
```

3. **Server starten:**
```bash
npm start
```

Oder für Entwicklung mit automatischem Neustart:
```bash
npm run dev
```

4. **Im Browser öffnen:**
```
http://localhost:3000
```

### Entwicklung

Für die Entwicklung mit automatischem Neustart bei Änderungen:

```bash
npm run dev
```

**Hinweis**: Für `npm run dev` wird `nodemon` benötigt, das automatisch als Dev-Dependency installiert wird.

## Projektstruktur

```
BBS-Friesoythe-Vertretungsplan/
├── public/                 # Statische Frontend-Dateien
│   ├── index.html         # Haupt-HTML-Datei mit Custom Date Picker
│   ├── script.js          # Frontend-JavaScript (Vanilla JS, modulare Klassen)
│   ├── styles.css         # Styling und Responsive Design
│   ├── impressum.html     # Impressum-Seite
│   ├── datenschutz.html   # Datenschutzerklärung
│   └── favicon.png        # Favicon
├── data/                  # Gespeicherte Vertretungsdaten
│   ├── config.json        # Index der gescrapten Daten
│   ├── temp_*.json        # Temporäre Dateien (nächste 4 Schultage)
│   └── data_*.json        # Tägliche Backups (Format: data_YYYY-MM-DD.json)
├── scrape.js             # Backend-Server & Scraping-Logik
├── package.json          # Projekt-Konfiguration und Dependencies
├── package-lock.json     # Dependency-Versionslock
├── .gitignore            # Git-Ignore-Datei
└── README.md             # Projektdokumentation
```

### Frontend-Architektur

Das Frontend ist in modulare Klassen unterteilt:

- **`CustomDatePicker`**: Verwaltet den benutzerdefinierten Datumsauswahl-Dialog
- **`DateManager`**: Verwaltet Datumslogik, Wochenende-Erkennung und Schultag-Berechnung
- **`DataManager`**: Verwaltet Datenabruf, Filterung und Sortierung
- **`UIManager`**: Verwaltet UI-Updates und Rendering
- **`StorageManager`**: Verwaltet LocalStorage und URL-Hash-Synchronisation
- **`EventHandler`**: Verwaltet alle Event-Listener und Benutzerinteraktionen

## API-Endpunkte

Die Anwendung stellt folgende REST-API-Endpunkte zur Verfügung:

- **`GET /api/data`** - Vertretungsdaten für heute (berücksichtigt 17:00 Uhr Regel)
- **`GET /api/morgen`** - Vertretungsdaten für morgen (überspringt Wochenenden automatisch)
- **`GET /api/date/:date`** - Vertretungsdaten für ein spezifisches Datum (Format: YYYY-MM-DD)
- **`GET /api/days`** - Vertretungsdaten für die nächsten 4 Schultage kombiniert
- **`GET /api/config`** - Index der gescrapten Daten (für Debugging/Monitoring)

### Antwortformat

```json
{
  "data": [
    {
      "kurs": "BES2G1",
      "stunde": "3 - 4",
      "raum": "C2.5",
      "lehrer": "MEYI (IMBUA)",
      "typ": "Vertretung",
      "notizen": "",
      "datum": "2025-12-12" // Nur bei /api/days, Format: YYYY-MM-DD
    }
  ],
  "courses": ["BES2G1", "BFGS2", "BFGS3", ...]
}
```

### Datenfelder

- **`kurs`**: Kursbezeichnung (z.B. "BES2G1", "BFGS2")
- **`stunde`**: Stundenangabe (kann einzelne Stunden oder Bereiche wie "3 - 4" enthalten)
- **`raum`**: Raumbezeichnung (kann auch Raumänderungen wie "C2.5 (C2.6)" enthalten)
- **`lehrer`**: Lehrerbezeichnung (kann Vertretungen wie "MEYI (IMBUA)" enthalten)
- **`typ`**: Typ der Änderung (z.B. "Entfall", "Raumänderung", "Verlegung", leer für normale Vertretung)
- **`notizen`**: Zusätzliche Notizen oder Informationen
- **`datum`**: Datum im Format YYYY-MM-DD (nur bei `/api/days` vorhanden)

## Automatische Updates

- **Initiales Scraping**: Beim Serverstart werden automatisch die nächsten 4 Schultage gescraped
- **Intervall-Updates**: Daten werden alle 10 Minuten automatisch aktualisiert
- **Tägliches Backup**: Um 03:00 Uhr MEZ wird ein tägliches Backup für die nächsten 4 Schultage erstellt
- **Intelligente Zeiterkennung**: Automatische Umschaltung auf den nächsten Tag ab 17:00 Uhr (deutsche Zeitzone)
- **Wochenende-Erkennung**: Automatisches Überspringen von Wochenenden (Samstag und Sonntag)
- **4-Tage-Scraping**: Paralleles Scraping von 4 Tagen (heute, morgen, übermorgen, über-übermorgen) für optimale Performance
- **Automatische Bereinigung**: Alte temporäre Dateien werden automatisch gelöscht (behält nur die nächsten 4 Schultage)
- **Retry-Logik**: Automatische Wiederholung bei Fehlern (3 Versuche mit 5 Sekunden Verzögerung)
- **Kein Ad-hoc-Scraping**: Wenn für ein angefragtes Datum keine Daten vorhanden sind, wird nicht automatisch gescraped, sondern direkt zurückgegeben, dass keine Daten vorhanden sind

## URL-Hash-Funktionalität

Die Anwendung unterstützt URL-basierte Filterung für einfaches Teilen von Kursfiltern und Datumsauswahl:

### Hash-Format

```
#KURSNAME;date=YYYY-MM-DD
```

**Beispiele:**
- `#BES2G1` - Filtert nach Kurs "BES2G1"
- `#date=2025-12-12` - Zeigt Daten für den 12.12.2025
- `#BES2G1;date=2025-12-12` - Kombiniert Kursfilter und Datum

### Funktionsweise

- Der Hash wird automatisch aktualisiert, wenn Filter oder Datum geändert werden
- Beim Laden der Seite werden Hash-Parameter automatisch ausgelesen und angewendet
- Die Auswahl wird zusätzlich im LocalStorage gespeichert
- Hash hat Priorität über LocalStorage beim ersten Laden

## Konfiguration

### Umgebungsvariablen

- **`PORT`** - Server-Port (Standard: 3000)

### Konstanten in `scrape.js`

- **`UPDATE_INTERVAL`** - Update-Intervall in Millisekunden (Standard: 600000 = 10 Minuten)
- **`BACKUP_HOUR`** - Stunde für tägliches Backup (Standard: 3)
- **`SWITCH_HOUR`** - Stunde für Tagesumschaltung (Standard: 17)
- **`URLS`** - Objekt mit WebUntis-URLs für 4 Tage:
  - `TODAY`: Vertretung heute
  - `TOMORROW`: Vertretung morgen
  - `DAY_AFTER_TOMORROW`: Vertretung 2T vor
  - `DAY_AFTER_DAY_AFTER_TOMORROW`: Vertretung 3T vor

## Scraping-Details

### WebUntis-Integration

Die Anwendung scraped Daten von der WebUntis-Monitor-Seite der BBS Friesoythe:

- **Basis-URL**: `https://bbs-friesoythe.webuntis.com/WebUntis/monitor`
- **Parameter**: `school=bbs-friesoythe&monitorType=subst&format=Vertretung [heute|morgen|2T vor|3T vor]`
- **Paralleles Scraping**: 4 separate Puppeteer-Pages für optimale Performance
- **Request-Optimierung**: Bilder, Stylesheets und Fonts werden blockiert
- **Timeout**: 60 Sekunden pro Request
- **Retry-Mechanismus**: 3 Versuche mit 5 Sekunden Verzögerung bei Fehlern

### Datenvalidierung

- Automatische Erkennung leerer Seiten
- Validierung von HTTP-Status-Codes
- Erkennung von Login-Umleitungen
- Fallback auf leere Arrays bei Fehlern

## Entwicklung

### Code-Stil

- Konstanten in `SCREAMING_SNAKE_CASE`
- Variablen und Funktionen in `camelCase`
- Klassen in `PascalCase`
- Asynchrone Abläufe mit `async/await`
- Frontend: Modulare Klassen-Architektur
- Backend: Funktionale Programmierung mit Helper-Funktionen
- Umfassende Fehlerbehandlung mit Try-Catch-Blöcken
- Console-Logging für Debugging und Monitoring

### Architektur

- **Modularer Aufbau**: Klare Trennung zwischen Frontend und Backend
- **Frontend-Modularität**: Klassen-basierte Architektur für bessere Wartbarkeit
- **Error Handling**: Umfassende Fehlerbehandlung mit Retry-Logik (3 Versuche, 5 Sekunden Verzögerung)
- **Performance**: 
  - Paralleles Scraping von 4 Tagen mit separaten Puppeteer-Pages
  - Request-Interception zum Blockieren von Bildern, Stylesheets und Fonts
  - Optimiertes Timeout-Management (60 Sekunden)
- **Caching**: 
  - Lokale JSON-Dateien für temporäre Daten (temp_*.json)
  - Tägliche Backups (data_*.json)
  - Index-basierte Datenverwaltung (config.json)
  - Automatische Fallback-Logik: temp → backup → keine Daten (kein automatisches Scraping bei API-Anfragen)
- **Datenverwaltung**:
  - Automatische Bereinigung alter temporärer Dateien
  - Beibehaltung der nächsten 4 Schultage
  - Wochenende-Erkennung und automatisches Überspringen

## Beitragen

Beiträge sind willkommen! Bitte folgen Sie diesen Schritten:

1. Fork erstellen
2. Feature Branch erstellen (`git checkout -b feature/AmazingFeature`)
3. Änderungen committen (`git commit -m 'Add some AmazingFeature'`)
4. Branch pushen (`git push origin feature/AmazingFeature`)
5. Pull Request erstellen

## Lizenz

Dieses Projekt ist unter einer eingeschränkten Lizenz nur für persönliche Nutzung lizenziert:

```
Custom Personal Use License

Copyright (c) 2025 DeekenDigital by Konstantin Deeken

Die Erlaubnis zur Nutzung, Kopierung, Modifizierung und/oder Verteilung dieser Software
wird hiermit ausschließlich für persönliche, nicht-kommerzielle Zwecke erteilt,
vorausgesetzt, dass der obige Copyright-Hinweis und dieser Erlaubnishinweis in allen
Kopien oder wesentlichen Teilen der Software enthalten sind.

DIE SOFTWARE WIRD OHNE JEDE AUSDRÜCKLICHE ODER IMPLIZIERTE GARANTIE BEREITGESTELLT,
EINSCHLIESSLICH DER GARANTIE ZUR BENUTZUNG FÜR DEN VORGESEHENEN ODER EINEM BESTIMMTEN
ZWECK SOWIE JEGLICHER RECHTSVERLETZUNG, JEDOCH NICHT DARAUF BESCHRÄNKT. IN KEINEM
FALL SIND DIE AUTOREN ODER COPYRIGHTINHABER FÜR JEGLICHEN SCHADEN ODER SONSTIGE
ANSPRÜCHE HAFTBAR ZU MACHEN, OB INFOLGE DER ERFÜLLUNG EINES VERTRAGES, EINES DELIKTES
ODER ANDERS IM ZUSAMMENHANG MIT DER SOFTWARE ODER SONSTIGER VERWENDUNG DER SOFTWARE
ENTSTANDEN.
```

### Was die Lizenz erlaubt:
- ✅ Private, nicht-kommerzielle Nutzung
- ✅ Modifikation für persönliche Zwecke
- ✅ Private Verteilung

### Bedingungen:
- ℹ️ Lizenz und Copyright müssen in allen Kopien enthalten sein
- ℹ️ Änderungen müssen dokumentiert werden
- ℹ️ Nur für persönliche, nicht-kommerzielle Projekte

### Einschränkungen:
- ❌ Keine kommerzielle Nutzung
- ❌ Keine Haftung durch die Autoren
- ❌ Keine Garantien durch die Autoren

## Kontakt & Support

### Projekt-Informationen

- **Projektseite**: [bbs.deeken.digital](https://bbs.deeken.digital)
- **GitHub Repository**: [BBS-Friesoythe-Vertretungsplan](https://github.com/KonsDeeken/BBS-Friesoythe-Vertretungsplan)
- **Verbesserungsvorschläge**: [Feedback-Formular](https://forms.gle/SdA2HfNGgqiHhsoa9)

### DeekenDigital

- **Website**: [deeken.digital](https://deeken.digital)
- **Impressum**: [deeken.digital/impressum](https://deeken.digital/impressum)
- **Datenschutz**: [deeken.digital/datenschutz](https://deeken.digital/datenschutz)

### Rechtliches

- **Impressum**: [bbs.deeken.digital/impressum.html](https://bbs.deeken.digital/impressum.html)
- **Datenschutzerklärung**: [bbs.deeken.digital/datenschutz.html](https://bbs.deeken.digital/datenschutz.html)

---

**Entwickelt mit ❤️ von [DeekenDigital by Konstantin Deeken](https://deeken.digital)**

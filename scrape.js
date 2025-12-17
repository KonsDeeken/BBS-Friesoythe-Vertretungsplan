const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Konstanten
const PORT = process.env.PORT || 3000;
const BACKUP_HOUR = 3; // Uhrzeit für tägliches Backup
const UPDATE_INTERVAL = 600000; // 10 Minuten in Millisekunden
const SWITCH_HOUR = 17; // Ab dieser Uhrzeit wird auf den nächsten Tag umgeschaltet

const URLS = {
    TODAY: 'https://bbs-friesoythe.webuntis.com/WebUntis/monitor?school=bbs-friesoythe&monitorType=subst&format=Vertretung%20heute',
    TOMORROW: 'https://bbs-friesoythe.webuntis.com/WebUntis/monitor?school=bbs-friesoythe&monitorType=subst&format=Vertretung%20morgen',
    DAY_AFTER_TOMORROW: 'https://bbs-friesoythe.webuntis.com/WebUntis/monitor?school=bbs-friesoythe&monitorType=subst&format=Vertretung%202T%20vor',
    DAY_AFTER_DAY_AFTER_TOMORROW: 'https://bbs-friesoythe.webuntis.com/WebUntis/monitor?school=bbs-friesoythe&monitorType=subst&format=Vertretung%203T%20vor'
};

// Lock-Mechanismus für Scraping-Prozesse
let isScraping = false;
let scrapingPromise = null;

// Express App Setup
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Verzeichnisstruktur
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const configFile = path.join(dataDir, 'config.json');

/**
 * Prüft, ob ein Datum ein Wochenende ist
 * @param {Date} date - Das zu prüfende Datum
 * @returns {boolean} true wenn Wochenende (Samstag oder Sonntag)
 */
const isWeekend = (date) => {
    // Verwende getUTCDay() für konsistente Prüfung unabhängig von lokaler Zeitzone
    const day = date.getUTCDay();
    return day === 0 || day === 6; // 0 = Sonntag, 6 = Samstag
};

/**
 * Ermittelt das nächste Schultag-Datum
 * @param {Date} date - Startdatum
 * @returns {Date} Nächster Schultag
 */
const getNextSchoolDay = (date) => {
    const nextDay = new Date(date);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    while (isWeekend(nextDay)) {
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    }
    return nextDay;
};

/**
 * Extrahiert das tatsächliche Datum aus dateText (z.B. "Freitag, 19.12.2025" -> "2025-12-19")
 * @param {string} dateText - Datumstext im Format "Wochentag, DD.MM.YYYY"
 * @returns {string|null} Datum im Format YYYY-MM-DD oder null
 */
const extractActualDateFromText = (dateText) => {
    if (!dateText) return null;
    
    // Suche nach Format "DD.MM.YYYY" oder "D.M.YYYY"
    const match = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (match) {
        const day = String(match[1]).padStart(2, '0');
        const month = String(match[2]).padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
    
    return null;
};

/**
 * Liest die config.json Datei
 * @returns {Object} Config-Objekt mit Index
 */
const readConfig = () => {
    try {
        if (fs.existsSync(configFile)) {
            const content = fs.readFileSync(configFile, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error('Fehler beim Lesen der config.json:', error);
    }
    
    // Standard-Struktur zurückgeben
    return {
        index: {},
        lastUpdated: null
    };
};

/**
 * Schreibt die config.json Datei
 * @param {Object} config - Config-Objekt
 */
const writeConfig = (config) => {
    try {
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
        console.error('Fehler beim Schreiben der config.json:', error);
    }
};

/**
 * Aktualisiert den Index in config.json
 * @param {string} actualDate - Tatsächliches gescraptes Datum (YYYY-MM-DD)
 * @param {string} dateText - Gescraptes Datum mit Wochentag (z.B. "Freitag, 19.12.2025")
 * @param {string} filename - Dateiname (z.B. "temp_2025-12-19.json")
 */
const updateIndex = (actualDate, dateText, filename) => {
    const config = readConfig();
    
    config.index[actualDate] = {
        actualDate: actualDate,
        dateText: dateText || null,
        filename: filename,
        scrapedAt: new Date().toISOString()
    };
    
    config.lastUpdated = new Date().toISOString();
    
    writeConfig(config);
    console.log(`Index aktualisiert: ${actualDate} (${dateText || 'kein dateText'})`);
};

/**
 * Sucht im Index nach einem Datum
 * @param {string} date - Datum im Format YYYY-MM-DD
 * @returns {Object|null} Index-Eintrag oder null
 */
const findInIndex = (date) => {
    const config = readConfig();
    
    // Direkte Suche nach actualDate (Schlüssel im Index)
    if (config.index[date]) {
        return config.index[date];
    }
    
    return null;
};

/**
 * Ermittelt das korrekte Datum basierend auf der Tageszeit
 * @returns {string} Datum im Format YYYY-MM-DD
 */
const getCorrectDate = () => {
    // Erstelle Datum in deutscher Zeitzone (Europe/Berlin)
    const now = new Date();
    
    // Verwende Intl.DateTimeFormat für zuverlässige Zeitzone-Konvertierung
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    const germanDate = {
        year: parseInt(parts.find(p => p.type === 'year').value),
        month: parseInt(parts.find(p => p.type === 'month').value) - 1, // 0-indexed
        day: parseInt(parts.find(p => p.type === 'day').value),
        hour: parseInt(parts.find(p => p.type === 'hour').value)
    };
    
    // Erstelle Date-Objekt für deutsche Zeit (UTC-basiert, aber mit korrekten Werten)
    const germanTime = new Date(Date.UTC(
        germanDate.year,
        germanDate.month,
        germanDate.day,
        germanDate.hour,
        0, 0, 0
    ));
    
    // Wenn es nach SWITCH_HOUR ist, zum nächsten Tag springen
    if (germanDate.hour >= SWITCH_HOUR) {
        // Wenn aktuell Wochenende ist und nach SWITCH_HOUR, zum nächsten Schultag springen
        if (isWeekend(germanTime)) {
            const nextSchoolDay = getNextSchoolDay(germanTime);
            return nextSchoolDay.toISOString().split('T')[0];
        }
        germanTime.setUTCDate(germanTime.getUTCDate() + 1);
        // Wenn der nächste Tag ein Wochenende ist, zum nächsten Schultag springen
        if (isWeekend(germanTime)) {
            const nextSchoolDay = getNextSchoolDay(germanTime);
            return nextSchoolDay.toISOString().split('T')[0];
        }
        // Wenn der nächste Tag kein Wochenende ist, formatiere und gib ihn zurück
        const year = germanTime.getUTCFullYear();
        const month = String(germanTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(germanTime.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } else if (isWeekend(germanTime)) {
        // Wenn aktuell Wochenende ist, zum nächsten Schultag springen
        const nextSchoolDay = getNextSchoolDay(germanTime);
        return nextSchoolDay.toISOString().split('T')[0];
    }
    
    // Formatiere das Datum korrekt (YYYY-MM-DD)
    const year = germanDate.year;
    const month = String(germanDate.month + 1).padStart(2, '0');
    const day = String(germanDate.day).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Add retry logic helper function
const retry = async (fn, retries = 3, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`Attempt ${i + 1} failed, retrying in ${delay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Add URL validation function
const validateUrl = async (page, url) => {
    try {
        console.log(`Attempting to access ${url}...`);
        const response = await page.goto(url, { 
            waitUntil: ['networkidle2', 'domcontentloaded'],
            timeout: 60000  // Increased timeout to 60 seconds
        });
        
        if (!response.ok()) {
            throw new Error(`HTTP ${response.status()} on ${url}`);
        }

        // Check if we got redirected to a login page or error page
        const currentUrl = page.url();
        if (currentUrl.includes('login') || currentUrl.includes('error')) {
            throw new Error(`Redirected to ${currentUrl}`);
        }

        console.log(`Successfully accessed ${url}`);
        return true;
    } catch (error) {
        console.error(`Failed to access ${url}:`, error);
        return false;
    }
};

/**
 * Scrapt die Vertretungsdaten von WebUntis für 4 Tage
 * @returns {Promise<{dataToday: {data: Array, dateText: string}, dataTomorrow: {data: Array, dateText: string}, dataDayAfterTomorrow: {data: Array, dateText: string}, dataDayAfterDayAfterTomorrow: {data: Array, dateText: string}}>}
 */
const scrapeData = async () => {
    console.log("Starting scraping process for 4 days...");
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // Erstelle vier separate Pages für parallele Verarbeitung
        const [pageToday, pageTomorrow, pageDayAfterTomorrow, pageDayAfterDayAfterTomorrow] = await Promise.all([
            browser.newPage(),
            browser.newPage(),
            browser.newPage(),
            browser.newPage()
        ]);

        // Konfiguriere alle Pages
        for (const page of [pageToday, pageTomorrow, pageDayAfterTomorrow, pageDayAfterDayAfterTomorrow]) {
            page.setDefaultTimeout(60000); // 60 seconds timeout
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setRequestInterception(true);
            
            // Optimize page loading
            page.on('request', (request) => {
                if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
                    request.abort();
                } else {
                    request.continue();
                }
            });
        }

        // Parallel scraping für alle 4 Tage
        console.log("Starting parallel scraping for 4 days...");
        const [dataToday, dataTomorrow, dataDayAfterTomorrow, dataDayAfterDayAfterTomorrow] = await Promise.all([
            // Scrape heute
            retry(async () => {
                console.log("Scraping today's data...");
                if (!await validateUrl(pageToday, URLS.TODAY)) {
                    throw new Error("Failed to access today's URL");
                }
                const result = await extractTableData(pageToday);
                console.log(`Found ${result.data.length} entries for today, date: ${result.dateText || 'unknown'}`);
                return result;
            }),
            // Scrape morgen
            retry(async () => {
                console.log("Scraping tomorrow's data...");
                if (!await validateUrl(pageTomorrow, URLS.TOMORROW)) {
                    throw new Error("Failed to access tomorrow's URL");
                }
                const result = await extractTableData(pageTomorrow);
                console.log(`Found ${result.data.length} entries for tomorrow, date: ${result.dateText || 'unknown'}`);
                return result;
            }),
            // Scrape übernächster Tag (2T vor)
            retry(async () => {
                console.log("Scraping day after tomorrow's data...");
                if (!await validateUrl(pageDayAfterTomorrow, URLS.DAY_AFTER_TOMORROW)) {
                    throw new Error("Failed to access day after tomorrow's URL");
                }
                const result = await extractTableData(pageDayAfterTomorrow);
                console.log(`Found ${result.data.length} entries for day after tomorrow, date: ${result.dateText || 'unknown'}`);
                return result;
            }),
            // Scrape über-übernächster Tag (3T vor)
            retry(async () => {
                console.log("Scraping day after day after tomorrow's data...");
                if (!await validateUrl(pageDayAfterDayAfterTomorrow, URLS.DAY_AFTER_DAY_AFTER_TOMORROW)) {
                    throw new Error("Failed to access day after day after tomorrow's URL");
                }
                const result = await extractTableData(pageDayAfterDayAfterTomorrow);
                console.log(`Found ${result.data.length} entries for day after day after tomorrow, date: ${result.dateText || 'unknown'}`);
                return result;
            })
        ]);

        return { dataToday, dataTomorrow, dataDayAfterTomorrow, dataDayAfterDayAfterTomorrow };
    } catch (error) {
        console.error("Error during scraping:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

/**
 * Extrahiert Tabellendaten von einer WebUntis-Seite
 * @param {Page} page - Puppeteer Page Objekt
 * @returns {Promise<{data: Array, dateText: string}>}
 */
const extractTableData = async (page) => {
    try {
        // Warte zunächst darauf, dass die Seite vollständig geladen ist
        await page.waitForSelector('body', { timeout: 10000 }).catch(() => {
            console.log("Body selector not found, proceeding anyway...");
        });

        // Prüfe den Seiteninhalt mit einem kürzeren Timeout
        let waitResult = null;
        try {
            const waitResultHandle = await page.waitForFunction(() => {
                const rows = document.querySelectorAll('table tbody tr');
                if (rows.length > 0) {
                    return { hasRows: true, reason: 'rows-detected' };
                }

                const emptySelectors = [
                    '.monitor-no-data',
                    '.monitorMessage',
                    '.untis-message',
                    '.alert-warning',
                    '.alert-info',
                    '[class*="no-data"]',
                    '[class*="empty"]'
                ];
                const emptyElementFound = emptySelectors.some(selector => {
                    try {
                        return document.querySelector(selector) !== null;
                    } catch {
                        return false;
                    }
                });

                const pageText = document.body?.innerText?.toLowerCase() || '';
                const emptyTextSnippets = [
                    'keine daten',
                    'kein vertretungsplan',
                    'keine vertretungen',
                    'no data',
                    'no entries',
                    'noch keine informationen',
                    'keine einträge',
                    'vertretungsplan',
                    'keine informationen'
                ];
                const emptyTextFound = emptyTextSnippets.some(snippet => pageText.includes(snippet));

                // Prüfe auch, ob eine Tabelle existiert, aber leer ist
                const tableExists = document.querySelector('table') !== null;
                if (tableExists && rows.length === 0) {
                    return { hasRows: false, reason: 'empty-table' };
                }

                if (emptyElementFound || emptyTextFound) {
                    return { hasRows: false, reason: 'empty-indicator' };
                }

                return false;
            }, { timeout: 20000 }); // Reduzierter Timeout auf 20 Sekunden

            waitResult = await waitResultHandle.jsonValue();
            await waitResultHandle.dispose();
        } catch (timeoutError) {
            // Wenn Timeout auftritt, prüfe den aktuellen Zustand der Seite
            console.log("Timeout beim Warten auf Seiteninhalt, prüfe aktuellen Zustand...");
            waitResult = await page.evaluate(() => {
                const rows = document.querySelectorAll('table tbody tr');
                if (rows.length > 0) {
                    return { hasRows: true, reason: 'rows-detected-after-timeout' };
                }

                const emptySelectors = [
                    '.monitor-no-data',
                    '.monitorMessage',
                    '.untis-message',
                    '.alert-warning',
                    '.alert-info'
                ];
                const emptyElementFound = emptySelectors.some(selector => document.querySelector(selector));

                const pageText = document.body?.innerText?.toLowerCase() || '';
                const emptyTextSnippets = [
                    'keine daten',
                    'kein vertretungsplan',
                    'keine vertretungen',
                    'no data',
                    'no entries'
                ];
                const emptyTextFound = emptyTextSnippets.some(snippet => pageText.includes(snippet));

                // Wenn eine Tabelle existiert, aber leer ist, ist das auch ein gültiger Zustand
                const tableExists = document.querySelector('table') !== null;
                if (tableExists) {
                    return { hasRows: false, reason: 'empty-table-after-timeout' };
                }

                return { hasRows: false, reason: 'timeout-fallback' };
            });
        }

        if (!waitResult?.hasRows) {
            console.log(`No substitution rows rendered on page (reason: ${waitResult?.reason || 'unknown'}), returning empty dataset.`);
            return { data: [], dateText: null };
        }
        
        // Extrahiere die Tabellendaten und das Datum
        const result = await page.evaluate(() => {
            // Extrahiere das Datum aus dem dateNode Element
            let dateText = null;
            const dateNode = document.querySelector('[data-dojo-attach-point="dateNode"]');
            if (dateNode) {
                dateText = dateNode.textContent?.trim() || null;
            } else {
                // Fallback: Suche im title-Text nach dem Datum
                const titleNode = document.querySelector('[data-dojo-attach-point="titleNode"]');
                if (titleNode) {
                    const titleText = titleNode.textContent || '';
                    // Suche nach Format "Freitag, 19.12.2025" oder ähnlich
                    const dateMatch = titleText.match(/([A-Za-zäöüÄÖÜß]+,\s*\d{1,2}\.\d{1,2}\.\d{4})/);
                    if (dateMatch) {
                        dateText = dateMatch[1].trim();
                    }
                }
            }

            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            if (!rows.length) {
                console.log("No rows found in table");
                return { data: [], dateText };
            }

            const data = rows.map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 7) {
                    console.log("Row has insufficient cells:", cells.length);
                    return null;
                }

                return {
                    kurs: cells[0]?.innerText?.trim() || '',
                    stunde: cells[2]?.innerText?.trim() || '',
                    raum: cells[3]?.innerText?.trim() || '',
                    lehrer: cells[4]?.innerText?.trim() || '',
                    typ: cells[5]?.innerText?.trim() || '',
                    notizen: cells[6]?.innerText?.trim() || '',
                };
            }).filter(Boolean); // Remove any null entries

            return { data, dateText };
        });

        return result;
    } catch (error) {
        console.error("Error extracting table data:", error);
        // Bei jedem Fehler eine leere Liste zurückgeben statt zu crashen
        return [];
    }
};

/**
 * Löscht alte temporäre Dateien im data-Verzeichnis (behält die nächsten 4 gescrapten Tage)
 * Bereinigt auch den Index in config.json
 */
const cleanupOldTempFiles = () => {
    try {
        const config = readConfig();
        const files = fs.readdirSync(dataDir);
        
        // Hole die tatsächlichen gescrapten Daten aus dem Index (die nächsten 4)
        const actualDatesToKeep = Object.values(config.index)
            .map(entry => entry.actualDate)
            .filter(date => {
                // Prüfe, ob das Datum heute oder in der Zukunft liegt
                const entryDate = new Date(date + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return entryDate >= today;
            })
            .sort()
            .slice(0, 4); // Nimm die nächsten 4
        
        let indexUpdated = false;
        
        // Lösche Einträge aus dem Index, die nicht in actualDatesToKeep sind
        for (const actualDate in config.index) {
            if (!actualDatesToKeep.includes(actualDate)) {
                delete config.index[actualDate];
                indexUpdated = true;
                console.log(`Index-Eintrag entfernt: ${actualDate}`);
            }
        }
        
        // Lösche Dateien, die nicht mehr im Index sind
        files.forEach(file => {
            if (file.startsWith('temp_')) {
                const fileDate = file.replace('temp_', '').replace('.json', '');
                if (!actualDatesToKeep.includes(fileDate)) {
                    const filePath = path.join(dataDir, file);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`Alte temporäre Datei gelöscht: ${file}`);
                    }
                }
            }
        });
        
        if (indexUpdated) {
            writeConfig(config);
            console.log('Index bereinigt');
        }
    } catch (error) {
        console.error('Fehler beim Löschen alter temporärer Dateien:', error);
    }
};

/**
 * Speichert die temporären Vertretungsdaten für 4 Tage
 * Verwendet Lock-Mechanismus, um parallele Scraping-Prozesse zu verhindern
 */
const saveTemporaryData = async () => {
    // Wenn bereits ein Scraping läuft, warte auf das bestehende Promise
    if (isScraping && scrapingPromise) {
        console.log('Scraping läuft bereits, warte auf bestehenden Prozess...');
        try {
            await scrapingPromise;
            return; // Das bestehende Scraping hat die Daten bereits gespeichert
        } catch (error) {
            console.error('Fehler beim Warten auf bestehenden Scraping-Prozess:', error);
            // Falls der bestehende Prozess fehlgeschlagen ist, starte einen neuen
        }
    }

    // Setze Lock und starte Scraping
    isScraping = true;
    scrapingPromise = (async () => {
        try {
            const { dataToday, dataTomorrow, dataDayAfterTomorrow, dataDayAfterDayAfterTomorrow } = await scrapeData();
            const currentDateStr = getCorrectDate();
            
            // Parse das Datum (Format: YYYY-MM-DD)
            const [year, month, day] = currentDateStr.split('-').map(Number);
            let currentDateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
            
            // Berechne die nächsten 4 Schultage
            const dates = [];
            
            // Stelle sicher, dass wir mit einem Schultag starten
            if (isWeekend(currentDateObj)) {
                currentDateObj = getNextSchoolDay(currentDateObj);
            }
            
            // Sammle die nächsten 4 Schultage
            while (dates.length < 4) {
                dates.push(currentDateObj.toISOString().split('T')[0]);
                currentDateObj = getNextSchoolDay(currentDateObj);
            }
            
            // Lösche alte temporäre Dateien
            cleanupOldTempFiles();
            
            // Speichere Daten mit Kurs-Liste und gescraptem Datum
            const saveData = (scrapedResult) => {
                // Extrahiere das tatsächliche Datum aus dateText
                const actualDate = extractActualDateFromText(scrapedResult.dateText);
                
                if (!actualDate) {
                    console.warn(`Konnte kein Datum aus dateText extrahieren: ${scrapedResult.dateText}`);
                    return; // Überspringe, wenn kein Datum extrahiert werden kann
                }
                
                const filename = `temp_${actualDate}.json`;
                const filePath = path.join(dataDir, filename);
                
                fs.writeFileSync(
                    filePath,
                    JSON.stringify({
                        data: scrapedResult.data,
                        courses: [...new Set(scrapedResult.data.map(item => item.kurs))],
                        dateText: scrapedResult.dateText || null // Gescraptes Datum mit Wochentag
                    })
                );
                
                // Aktualisiere Index mit tatsächlichem Datum
                updateIndex(actualDate, scrapedResult.dateText, filename);
            };

            // Speichere alle 4 Tage (basierend auf tatsächlichem gescraptem Datum)
            saveData(dataToday);
            saveData(dataTomorrow);
            saveData(dataDayAfterTomorrow);
            saveData(dataDayAfterDayAfterTomorrow);
            
            console.log(`Saved data for 4 days: ${dates.join(', ')}`);
        } catch (error) {
            console.error('Fehler beim Speichern der temporären Daten:', error);
            throw error; // Weiterwerfen, damit wartende Promises den Fehler sehen
        }
    })();

    try {
        await scrapingPromise;
    } finally {
        // Lock immer zurücksetzen, auch bei Fehlern
        isScraping = false;
        scrapingPromise = null;
    }
};

/**
 * Erstellt ein tägliches Backup der Vertretungsdaten für 4 Tage
 * Verwendet Lock-Mechanismus, um parallele Scraping-Prozesse zu verhindern
 */
const createDailyBackup = async () => {
    // Wenn bereits ein Scraping läuft, warte auf das bestehende Promise
    if (isScraping && scrapingPromise) {
        console.log('Scraping läuft bereits für Backup, warte auf bestehenden Prozess...');
        try {
            await scrapingPromise;
            // Nach dem Warten die Backup-Dateien erstellen (Daten wurden bereits gescraped)
            const currentDateStr = getCorrectDate();
            const [year, month, day] = currentDateStr.split('-').map(Number);
            let currentDateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
            
            if (isWeekend(currentDateObj)) {
                currentDateObj = getNextSchoolDay(currentDateObj);
            }
            
            const dates = [];
            while (dates.length < 4) {
                dates.push(currentDateObj.toISOString().split('T')[0]);
                currentDateObj = getNextSchoolDay(currentDateObj);
            }
            
            // Lese die bereits gespeicherten temp-Dateien und erstelle Backups
            const createBackup = (date) => {
                const tempFile = path.join(dataDir, `temp_${date}.json`);
                const backupFile = path.join(dataDir, `data_${date}.json`);
                if (fs.existsSync(tempFile)) {
                    const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
                    fs.writeFileSync(backupFile, JSON.stringify(data));
                }
            };
            
            dates.forEach(date => createBackup(date));
            console.log(`Backup created for 4 days: ${dates.join(', ')}`);
            return;
        } catch (error) {
            console.error('Fehler beim Warten auf bestehenden Scraping-Prozess für Backup:', error);
            // Falls der bestehende Prozess fehlgeschlagen ist, starte einen neuen
        }
    }

    // Setze Lock und starte Scraping
    isScraping = true;
    scrapingPromise = (async () => {
        try {
            console.log("Creating daily backup for 4 days...");
            const { dataToday, dataTomorrow, dataDayAfterTomorrow, dataDayAfterDayAfterTomorrow } = await scrapeData();
            const currentDateStr = getCorrectDate();
            
            // Parse das Datum (Format: YYYY-MM-DD)
            const [year, month, day] = currentDateStr.split('-').map(Number);
            let currentDateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
            
            // Berechne die nächsten 4 Schultage
            const dates = [];
            
            // Stelle sicher, dass wir mit einem Schultag starten
            if (isWeekend(currentDateObj)) {
                currentDateObj = getNextSchoolDay(currentDateObj);
            }
            
            // Sammle die nächsten 4 Schultage
            while (dates.length < 4) {
                dates.push(currentDateObj.toISOString().split('T')[0]);
                currentDateObj = getNextSchoolDay(currentDateObj);
            }
            
            // Backup Daten speichern (basierend auf tatsächlichem gescraptem Datum)
            const createBackup = (scrapedResult) => {
                // Extrahiere das tatsächliche Datum aus dateText
                const actualDate = extractActualDateFromText(scrapedResult.dateText);
                
                if (!actualDate) {
                    console.warn(`Konnte kein Datum aus dateText extrahieren für Backup: ${scrapedResult.dateText}`);
                    return; // Überspringe, wenn kein Datum extrahiert werden kann
                }
                
                fs.writeFileSync(
                    path.join(dataDir, `data_${actualDate}.json`),
                    JSON.stringify({
                        data: scrapedResult.data,
                        courses: [...new Set(scrapedResult.data.map(item => item.kurs))],
                        dateText: scrapedResult.dateText || null // Gescraptes Datum mit Wochentag
                    })
                );
            };

            // Speichere alle 4 Tage als Backup (basierend auf tatsächlichem gescraptem Datum)
            createBackup(dataToday);
            createBackup(dataTomorrow);
            createBackup(dataDayAfterTomorrow);
            createBackup(dataDayAfterDayAfterTomorrow);
            
            console.log(`Backup created for 4 days: ${dates.join(', ')}`);
        } catch (error) {
            console.error('Fehler beim Erstellen des Backups:', error);
            throw error; // Weiterwerfen, damit wartende Promises den Fehler sehen
        }
    })();

    try {
        await scrapingPromise;
    } finally {
        // Lock immer zurücksetzen, auch bei Fehlern
        isScraping = false;
        scrapingPromise = null;
    }
};

/**
 * Plant das tägliche Backup
 */
const scheduleBackup = () => {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(BACKUP_HOUR, 0, 0, 0);
    
    if (now >= nextRun) {
        nextRun.setDate(nextRun.getDate() + 1);
    }

    const timeUntilNextRun = nextRun - now;
    setTimeout(async () => {
        await createDailyBackup();
        setInterval(createDailyBackup, 24 * 60 * 60 * 1000);
    }, timeUntilNextRun);
};

// API-Endpunkte
app.get('/api/data', async (req, res) => {
    try {
        const currentDate = getCorrectDate();
        const data = await getDataForDate(currentDate);
        res.json(data);
    } catch (error) {
        console.error('Fehler beim Abrufen der Daten:', error);
        res.status(500).send('Serverfehler beim Abrufen der Daten');
    }
});

app.get('/api/morgen', async (req, res) => {
    try {
        const currentDateStr = getCorrectDate();
        // Parse das Datum (Format: YYYY-MM-DD)
        const [year, month, day] = currentDateStr.split('-').map(Number);
        const currentDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
        
        const tomorrowDate = new Date(currentDate);
        tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
        
        // Wenn der nächste Tag ein Wochenende ist, zum nächsten Schultag springen
        if (isWeekend(tomorrowDate)) {
            const nextSchoolDay = getNextSchoolDay(tomorrowDate);
            const nextSchoolDayStr = nextSchoolDay.toISOString().split('T')[0];
            const data = await getDataForDate(nextSchoolDayStr);
            res.json(data);
            return;
        }
        
        const tomorrowDateStr = tomorrowDate.toISOString().split('T')[0];
        const data = await getDataForDate(tomorrowDateStr);
        res.json(data);
    } catch (error) {
        console.error('Fehler beim Abrufen der Morgen-Daten:', error);
        res.status(500).send('Serverfehler beim Abrufen der Morgen-Daten');
    }
});

// Endpunkt für einzelnes Datum
app.get('/api/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        // Validiere Datumsformat (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            res.status(400).send('Ungültiges Datumsformat. Erwartet: YYYY-MM-DD');
            return;
        }
        const data = await getDataForDate(date);
        res.json(data);
    } catch (error) {
        console.error('Fehler beim Abrufen der Daten für Datum:', error);
        res.status(500).send('Serverfehler beim Abrufen der Daten');
    }
});

// Endpunkt zum Abrufen des Index (für Debugging/Monitoring)
app.get('/api/config', (req, res) => {
    try {
        const config = readConfig();
        res.json(config);
    } catch (error) {
        console.error('Fehler beim Abrufen der Config:', error);
        res.status(500).send('Serverfehler beim Abrufen der Config');
    }
});

// Endpunkt für 4 Schultage
app.get('/api/days', async (req, res) => {
    try {
        // Hole alle gescrapten Daten aus dem Index (die nächsten 4)
        const config = readConfig();
        const indexEntries = Object.values(config.index)
            .sort((a, b) => a.actualDate.localeCompare(b.actualDate))
            .slice(0, 4); // Nimm die ersten 4 Einträge (sortiert nach Datum)
        
        // Wenn keine Index-Einträge vorhanden, berechne die nächsten 4 Schultage als Fallback
        let dates = [];
        if (indexEntries.length === 0) {
            const currentDateStr = getCorrectDate();
            const [year, month, day] = currentDateStr.split('-').map(Number);
            let currentDateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
            
            if (isWeekend(currentDateObj)) {
                currentDateObj = getNextSchoolDay(currentDateObj);
            }
            
            while (dates.length < 4) {
                dates.push(currentDateObj.toISOString().split('T')[0]);
                currentDateObj = getNextSchoolDay(currentDateObj);
            }
        } else {
            // Verwende die tatsächlichen gescrapten Daten aus dem Index
            dates = indexEntries.map(entry => entry.actualDate);
        }

        // Hole Daten für alle 4 Tage parallel
        const [day1Data, day2Data, day3Data, day4Data] = await Promise.all([
            getDataForDate(dates[0]),
            getDataForDate(dates[1]),
            getDataForDate(dates[2]),
            getDataForDate(dates[3])
        ]);

        // Füge das Datum zu jedem Eintrag hinzu
        const day1Entries = day1Data.data.map(entry => ({
            ...entry,
            datum: dates[0]
        }));
        const day2Entries = day2Data.data.map(entry => ({
            ...entry,
            datum: dates[1]
        }));
        const day3Entries = day3Data.data.map(entry => ({
            ...entry,
            datum: dates[2]
        }));
        const day4Entries = day4Data.data.map(entry => ({
            ...entry,
            datum: dates[3]
        }));

        // Kombiniere die Daten und Kurse
        const combinedData = {
            data: [...day1Entries, ...day2Entries, ...day3Entries, ...day4Entries].filter(item => item.kurs?.trim()),
            courses: [...new Set([
                ...day1Data.courses || [],
                ...day2Data.courses || [],
                ...day3Data.courses || [],
                ...day4Data.courses || []
            ].filter(Boolean))],
            dates: [
                { date: dates[0], dateText: day1Data.dateText || null },
                { date: dates[1], dateText: day2Data.dateText || null },
                { date: dates[2], dateText: day3Data.dateText || null },
                { date: dates[3], dateText: day4Data.dateText || null }
            ]
        };

        res.json(combinedData);
    } catch (error) {
        console.error('Fehler beim Abrufen der 4 Tage:', error);
        res.status(500).send('Serverfehler beim Abrufen der 4 Tage');
    }
});

/**
 * Liest Vertretungsdaten für ein bestimmtes Datum
 * @param {string} date - Datum im Format YYYY-MM-DD (actualDate)
 * @returns {Promise<Object>}
 */
const getDataForDate = async (date) => {
    try {
        // Suche zuerst im Index nach dem Datum
        const indexEntry = findInIndex(date);
        
        if (indexEntry) {
            // Verwende die Datei aus dem Index
            const tempFile = path.join(dataDir, indexEntry.filename);
            const backupFile = path.join(dataDir, indexEntry.filename.replace('temp_', 'data_'));
            
            // Versuche zuerst die temporäre Datei
            if (fs.existsSync(tempFile)) {
                const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
                return {
                    data: data.data || [],
                    courses: [...new Set((data.courses || []).filter(Boolean))],
                    dateText: data.dateText || indexEntry.dateText || null
                };
            }
            
            // Versuche die Backup-Datei
            if (fs.existsSync(backupFile)) {
                const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
                return {
                    data: data.data || [],
                    courses: [...new Set((data.courses || []).filter(Boolean))],
                    dateText: data.dateText || indexEntry.dateText || null
                };
            }
        }
        
        // Fallback: Alte Logik (für Kompatibilität)
        const tempFile = path.join(dataDir, `temp_${date}.json`);
        const backupFile = path.join(dataDir, `data_${date}.json`);

        // Versuche zuerst die temporäre Datei zu lesen
        if (fs.existsSync(tempFile)) {
            const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
            return {
                data: data.data || [],
                courses: [...new Set((data.courses || []).filter(Boolean))],
                dateText: data.dateText || null
            };
        }

        // Wenn keine temporäre Datei existiert, versuche die Backup-Datei
        if (fs.existsSync(backupFile)) {
            const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            return {
                data: data.data || [],
                courses: [...new Set((data.courses || []).filter(Boolean))],
                dateText: data.dateText || null
            };
        }

        // Wenn keine Datei existiert, hole neue Daten
        // saveTemporaryData() hat bereits Lock-Mechanismus, also sicher aufrufen
        await saveTemporaryData();
        
        // Prüfe erneut im Index (könnte durch laufendes Scraping aktualisiert worden sein)
        const newIndexEntry = findInIndex(date);
        if (newIndexEntry) {
            const tempFileFromIndex = path.join(dataDir, newIndexEntry.filename);
            if (fs.existsSync(tempFileFromIndex)) {
                const data = JSON.parse(fs.readFileSync(tempFileFromIndex, 'utf8'));
                return {
                    data: data.data || [],
                    courses: [...new Set((data.courses || []).filter(Boolean))],
                    dateText: data.dateText || newIndexEntry.dateText || null
                };
            }
        }
        
        // Prüfe erneut, ob die Datei jetzt existiert (könnte durch laufendes Scraping erstellt worden sein)
        if (fs.existsSync(tempFile)) {
            const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
            return {
                data: data.data || [],
                courses: [...new Set((data.courses || []).filter(Boolean))],
                dateText: data.dateText || null
            };
        }
        
        // Falls immer noch keine Datei existiert, prüfe Backup erneut
        if (fs.existsSync(backupFile)) {
            const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            return {
                data: data.data || [],
                courses: [...new Set((data.courses || []).filter(Boolean))],
                dateText: data.dateText || null
            };
        }

        return { data: [], courses: [], dateText: null };
    } catch (error) {
        console.error(`Fehler beim Lesen der Daten für ${date}:`, error);
        return { data: [], courses: [], dateText: null };
    }
};

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft unter http://localhost:${PORT}`);
    scheduleBackup();
});

// Regelmäßige Aktualisierung der Daten
setInterval(saveTemporaryData, UPDATE_INTERVAL);

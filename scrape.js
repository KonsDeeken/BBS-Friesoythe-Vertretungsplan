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

// Express App Setup
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Verzeichnisstruktur
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

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
 * @returns {Promise<{dataToday: Array, dataTomorrow: Array, dataDayAfterTomorrow: Array, dataDayAfterDayAfterTomorrow: Array}>}
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
                const data = await extractTableData(pageToday);
                console.log(`Found ${data.length} entries for today`);
                return data;
            }),
            // Scrape morgen
            retry(async () => {
                console.log("Scraping tomorrow's data...");
                if (!await validateUrl(pageTomorrow, URLS.TOMORROW)) {
                    throw new Error("Failed to access tomorrow's URL");
                }
                const data = await extractTableData(pageTomorrow);
                console.log(`Found ${data.length} entries for tomorrow`);
                return data;
            }),
            // Scrape übernächster Tag (2T vor)
            retry(async () => {
                console.log("Scraping day after tomorrow's data...");
                if (!await validateUrl(pageDayAfterTomorrow, URLS.DAY_AFTER_TOMORROW)) {
                    throw new Error("Failed to access day after tomorrow's URL");
                }
                const data = await extractTableData(pageDayAfterTomorrow);
                console.log(`Found ${data.length} entries for day after tomorrow`);
                return data;
            }),
            // Scrape über-übernächster Tag (3T vor)
            retry(async () => {
                console.log("Scraping day after day after tomorrow's data...");
                if (!await validateUrl(pageDayAfterDayAfterTomorrow, URLS.DAY_AFTER_DAY_AFTER_TOMORROW)) {
                    throw new Error("Failed to access day after day after tomorrow's URL");
                }
                const data = await extractTableData(pageDayAfterDayAfterTomorrow);
                console.log(`Found ${data.length} entries for day after day after tomorrow`);
                return data;
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
 * @returns {Promise<Array>}
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
            return [];
        }
        
        // Extrahiere die Tabellendaten
        const data = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            if (!rows.length) {
                console.log("No rows found in table");
                return [];
            }

            return rows.map(row => {
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
        });

        return data;
    } catch (error) {
        console.error("Error extracting table data:", error);
        // Bei jedem Fehler eine leere Liste zurückgeben statt zu crashen
        return [];
    }
};

/**
 * Löscht alte temporäre Dateien im data-Verzeichnis (behält die nächsten 4 Schultage)
 */
const cleanupOldTempFiles = () => {
    try {
        // Aktuelles Datum ermitteln
        const currentDateStr = getCorrectDate();
        // Parse das Datum (Format: YYYY-MM-DD)
        const [year, month, day] = currentDateStr.split('-').map(Number);
        let currentDateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
        
        // Berechne die nächsten 4 Schultage
        const datesToKeep = [];
        
        // Stelle sicher, dass wir mit einem Schultag starten
        if (isWeekend(currentDateObj)) {
            currentDateObj = getNextSchoolDay(currentDateObj);
        }
        
        // Sammle die nächsten 4 Schultage
        while (datesToKeep.length < 4) {
            datesToKeep.push(currentDateObj.toISOString().split('T')[0]);
            currentDateObj = getNextSchoolDay(currentDateObj);
        }
        
        // Alle Dateien im data-Verzeichnis durchsuchen
        const files = fs.readdirSync(dataDir);
        
        // Temporäre Dateien filtern und löschen, außer die nächsten 4 Schultage
        files.forEach(file => {
            if (file.startsWith('temp_')) {
                const fileDate = file.replace('temp_', '').replace('.json', '');
                if (!datesToKeep.includes(fileDate)) {
                    const filePath = path.join(dataDir, file);
                    fs.unlinkSync(filePath);
                    console.log(`Alte temporäre Datei gelöscht: ${file}`);
                }
            }
        });
    } catch (error) {
        console.error('Fehler beim Löschen alter temporärer Dateien:', error);
    }
};

/**
 * Speichert die temporären Vertretungsdaten für 4 Tage
 */
const saveTemporaryData = async () => {
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
        
        // Speichere Daten mit Kurs-Liste
        const saveData = (data, date) => {
            fs.writeFileSync(
                path.join(dataDir, `temp_${date}.json`),
                JSON.stringify({
                    data,
                    courses: [...new Set(data.map(item => item.kurs))]
                })
            );
        };

        // Speichere alle 4 Tage
        saveData(dataToday, dates[0]);
        saveData(dataTomorrow, dates[1]);
        saveData(dataDayAfterTomorrow, dates[2]);
        saveData(dataDayAfterDayAfterTomorrow, dates[3]);
        
        console.log(`Saved data for 4 days: ${dates.join(', ')}`);
    } catch (error) {
        console.error('Fehler beim Speichern der temporären Daten:', error);
    }
};

/**
 * Erstellt ein tägliches Backup der Vertretungsdaten für 4 Tage
 */
const createDailyBackup = async () => {
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
        
        // Backup Daten speichern
        const createBackup = (data, date) => {
            fs.writeFileSync(
                path.join(dataDir, `data_${date}.json`),
                JSON.stringify({
                    data,
                    courses: [...new Set(data.map(item => item.kurs))]
                })
            );
        };

        // Speichere alle 4 Tage als Backup
        createBackup(dataToday, dates[0]);
        createBackup(dataTomorrow, dates[1]);
        createBackup(dataDayAfterTomorrow, dates[2]);
        createBackup(dataDayAfterDayAfterTomorrow, dates[3]);
        
        console.log(`Backup created for 4 days: ${dates.join(', ')}`);
    } catch (error) {
        console.error('Fehler beim Erstellen des Backups:', error);
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

// Endpunkt für 4 Schultage
app.get('/api/both', async (req, res) => {
    try {
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
            ].filter(Boolean))]
        };

        res.json(combinedData);
    } catch (error) {
        console.error('Fehler beim Abrufen der 4 Tage:', error);
        res.status(500).send('Serverfehler beim Abrufen der 4 Tage');
    }
});

/**
 * Liest Vertretungsdaten für ein bestimmtes Datum
 * @param {string} date - Datum im Format YYYY-MM-DD
 * @returns {Promise<Object>}
 */
const getDataForDate = async (date) => {
    const tempFile = path.join(dataDir, `temp_${date}.json`);
    const backupFile = path.join(dataDir, `data_${date}.json`);

    try {
        // Versuche zuerst die temporäre Datei zu lesen
        if (fs.existsSync(tempFile)) {
            const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
            return {
                data: data.data || [],
                courses: [...new Set((data.courses || []).filter(Boolean))]
            };
        }

        // Wenn keine temporäre Datei existiert, versuche die Backup-Datei
        if (fs.existsSync(backupFile)) {
            const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            return {
                data: data.data || [],
                courses: [...new Set((data.courses || []).filter(Boolean))]
            };
        }

        // Wenn keine Datei existiert, hole neue Daten
        await saveTemporaryData();
        if (fs.existsSync(tempFile)) {
            const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
            return {
                data: data.data || [],
                courses: [...new Set((data.courses || []).filter(Boolean))]
            };
        }

        return { data: [], courses: [] };
    } catch (error) {
        console.error(`Fehler beim Lesen der Daten für ${date}:`, error);
        return { data: [], courses: [] };
    }
};

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft unter http://localhost:${PORT}`);
    scheduleBackup();
});

// Regelmäßige Aktualisierung der Daten
setInterval(saveTemporaryData, UPDATE_INTERVAL);

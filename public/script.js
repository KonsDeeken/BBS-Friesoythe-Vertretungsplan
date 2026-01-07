// Konstanten
const API = {
    DATE: '/api/date',
    DAYS: '/api/days' // Für 4 Schultage
};

const STORAGE_KEYS = {
    SELECTED_COURSE: 'selectedCourse',
    SELECTED_DATE: 'selectedDate'
};

// DOM-Elemente werden nach dem vollständigen Laden der Seite initialisiert
let DOM = {};

document.addEventListener('DOMContentLoaded', () => {
    DOM = {
        date: document.getElementById('date'),
        datePicker: document.getElementById('datePicker'),
        datePickerTrigger: document.getElementById('datePickerTrigger'),
        datePickerDropdown: document.getElementById('datePickerDropdown'),
        datePickerDays: document.getElementById('datePickerDays'),
        currentMonth: document.getElementById('currentMonth'),
        prevMonth: document.getElementById('prevMonth'),
        nextMonth: document.getElementById('nextMonth'),
        todayBtn: document.getElementById('todayBtn'),
        selectedDateText: document.getElementById('selectedDateText'),
        bothDaysButton: document.getElementById('bothDaysButton'),
        courseFilter: document.getElementById('courseFilter'),
        dataBody: document.getElementById('data-body'),
        loadingIndicator: document.getElementById('loadingIndicator')
    };

    // Custom Date Picker initialisieren
    CustomDatePicker.init();
    
    // Anwendung starten
    EventHandler.init();
});

// Custom Date Picker Klasse
class CustomDatePicker {
    static currentDate = new Date();
    static selectedDate = null;
    static isOpen = false;

    static init() {
        // Trigger Button
        DOM.datePickerTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Navigation Buttons
        DOM.prevMonth.addEventListener('click', (e) => {
            e.stopPropagation();
            this.changeMonth(-1);
        });

        DOM.nextMonth.addEventListener('click', (e) => {
            e.stopPropagation();
            this.changeMonth(1);
        });

        // Heute Button
        DOM.todayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectToday();
        });

        // Schließen bei Klick außerhalb
        document.addEventListener('click', (e) => {
            if (!DOM.datePickerDropdown.contains(e.target) && 
                !DOM.datePickerTrigger.contains(e.target)) {
                this.close();
            }
        });

        // ESC zum Schließen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        });

        // Initial rendern
        this.render();
        
        // Ab 17 Uhr automatisch den nächsten Tag auswählen
        const currentDate = DateManager.getCurrentDate();
        const dateStr = DateManager.dateToString(currentDate);
        this.setDate(dateStr);
    }

    static toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    static open() {
        this.isOpen = true;
        DOM.datePickerDropdown.classList.add('active');
        this.render();
    }

    static close() {
        this.isOpen = false;
        DOM.datePickerDropdown.classList.remove('active');
    }

    static changeMonth(delta) {
        this.currentDate.setMonth(this.currentDate.getMonth() + delta);
        this.render();
    }

    static render() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        // Monat/Jahr anzeigen
        const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                           'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
        DOM.currentMonth.textContent = `${monthNames[month]} ${year}`;

        // Tage generieren
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mo = 0
        const daysInMonth = lastDay.getDate();

        // Vorheriger Monat
        const prevMonthLastDay = new Date(year, month, 0).getDate();

        let html = '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Tage vom vorherigen Monat
        for (let i = startDay - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            const date = new Date(year, month - 1, day);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            html += `<button type="button" class="day other-month ${isWeekend ? 'weekend' : ''}" 
                     data-date="${this.formatDate(date)}" ${isWeekend ? 'disabled' : ''}>${day}</button>`;
        }

        // Tage des aktuellen Monats
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = date.getTime() === today.getTime();
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isSelected = this.selectedDate && 
                              this.formatDate(date) === this.formatDate(this.selectedDate);

            let classes = 'day';
            if (isToday) classes += ' today';
            if (isWeekend) classes += ' weekend';
            if (isSelected) classes += ' selected';

            html += `<button type="button" class="${classes}" 
                     data-date="${this.formatDate(date)}" ${isWeekend ? 'disabled' : ''}>${day}</button>`;
        }

        // Tage vom nächsten Monat
        const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
        const remainingCells = totalCells - (startDay + daysInMonth);

        for (let day = 1; day <= remainingCells; day++) {
            const date = new Date(year, month + 1, day);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            html += `<button type="button" class="day other-month ${isWeekend ? 'weekend' : ''}" 
                     data-date="${this.formatDate(date)}" ${isWeekend ? 'disabled' : ''}>${day}</button>`;
        }

        DOM.datePickerDays.innerHTML = html;

        // Event Listener für Tage
        DOM.datePickerDays.querySelectorAll('.day:not(.weekend)').forEach(dayBtn => {
            dayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dateStr = dayBtn.dataset.date;
                this.selectDate(dateStr);
            });
        });
    }

    static selectDate(dateStr) {
        this.selectedDate = new Date(dateStr + 'T00:00:00');
        DOM.datePicker.value = dateStr;
        
        // Anzeige aktualisieren
        const options = { weekday: 'short', day: '2-digit', month: '2-digit' };
        DOM.selectedDateText.textContent = this.selectedDate.toLocaleDateString('de-DE', options);
        
        this.close();
        this.render();

        // Event auslösen
        DOM.datePicker.dispatchEvent(new Event('change'));
    }

    static selectToday() {
        const today = DateManager.getCurrentDate();
        const dateStr = DateManager.dateToString(today);
        this.selectDate(dateStr);
    }

    static formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    static setDate(dateStr) {
        if (dateStr) {
            this.selectedDate = new Date(dateStr + 'T00:00:00');
            this.currentDate = new Date(this.selectedDate);
            const options = { weekday: 'short', day: '2-digit', month: '2-digit' };
            DOM.selectedDateText.textContent = this.selectedDate.toLocaleDateString('de-DE', options);
        } else {
            this.selectedDate = null;
            DOM.selectedDateText.textContent = 'Datum wählen';
        }

        DOM.datePicker.value = dateStr || '';
        this.render();
    }

    static reset() {
        this.selectedDate = null;
        this.currentDate = new Date();
        DOM.selectedDateText.textContent = 'Datum wählen';
        DOM.datePicker.value = '';
        this.render();
    }
}

// Datum-Management
class DateManager {
    static SWITCH_HOUR = 17;

    static isWeekend(date) {
        // Verwende getUTCDay() für konsistente Prüfung unabhängig von lokaler Zeitzone
        const day = date.getUTCDay();
        return day === 0 || day === 6; // 0 = Sonntag, 6 = Samstag
    }

    static getNextSchoolDay(date) {
        const nextDay = new Date(date);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        while (this.isWeekend(nextDay)) {
            nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        }
        return nextDay;
    }

    static getCurrentDate() {
        // Verwende deutsche Zeitzone (Europe/Berlin)
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
        
        if (germanDate.hour >= this.SWITCH_HOUR) {
            // Wenn aktuelle Zeit nach SWITCH_HOUR ist und heute Wochenende, zum nächsten Schultag springen
            if (this.isWeekend(germanTime)) {
                return this.getNextSchoolDay(germanTime);
            }
            
            const tomorrow = new Date(germanTime);
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            
            // Wenn morgen Wochenende ist, zum nächsten Schultag springen
            if (this.isWeekend(tomorrow)) {
                return this.getNextSchoolDay(tomorrow);
            }
            
            return tomorrow;
        } else if (this.isWeekend(germanTime)) {
            // Wenn heute Wochenende ist, zum nächsten Schultag springen
            return this.getNextSchoolDay(germanTime);
        }

        return germanTime;
    }

    static getTomorrowDate() {
        const tomorrow = new Date(this.getCurrentDate());
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        
        // Wenn morgen Wochenende ist, zum nächsten Schultag springen
        if (this.isWeekend(tomorrow)) {
            return this.getNextSchoolDay(tomorrow);
        }
        
        return tomorrow;
    }

    static formatDate(date) {
        const options = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
        return date.toLocaleDateString('de-DE', options);
    }

    static formatDateShort(date) {
        const options = { weekday: 'long' };
        return date.toLocaleDateString('de-DE', options);
    }

    static formatDateFromString(dateStr) {
        const date = new Date(dateStr);
        return this.formatDateShort(date);
    }

    static dateToString(date) {
        // Konvertiert Date zu YYYY-MM-DD String (verwendet UTC für Konsistenz)
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    static stringToDate(dateStr) {
        // Konvertiert YYYY-MM-DD String zu Date
        return new Date(dateStr + 'T00:00:00');
    }

    static getDefaultDates() {
        // Gibt die nächsten 4 Schultage zurück (berücksichtigt 17 Uhr Regel)
        const today = this.getCurrentDate();
        const dates = [];
        let currentDate = new Date(today);
        
        // Stelle sicher, dass wir mit einem Schultag starten
        if (this.isWeekend(currentDate)) {
            currentDate = this.getNextSchoolDay(currentDate);
        }
        
        while (dates.length < 4) {
            dates.push(this.dateToString(currentDate));
            currentDate = this.getNextSchoolDay(currentDate);
        }
        
        return {
            dates: dates
        };
    }
}

// Daten-Management
class DataManager {
    static allData = [];
    static currentSortColumn = null;
    static isAscending = true;
    static currentMode = 'both'; // 'single' oder 'both'
    static currentDate = null; // YYYY-MM-DD für single mode
    static currentDates = null; // {date1, date2} für both mode
    static currentDateText = null; // Gescraptes Datum für single mode
    static currentDatesText = null; // Array mit gescrapten Datums-Texten für both mode
    static dateToDateTextMap = {}; // Mapping von datum (YYYY-MM-DD) zu dateText aus JSON

    static async fetchDataForDate(date) {
        try {
            // Nutze den neuen Endpunkt für einzelnes Datum
            const response = await fetch(`${API.DATE}/${date}`);
            if (!response.ok) throw new Error('Netzwerkantwort war nicht ok');
            
            const data = await response.json();
            const filteredData = (data.data || []).filter(item => item.kurs?.trim());
            const courses = [...new Set((data.courses || []).filter(Boolean))].sort();
            
            return {
                data: filteredData,
                courses: courses,
                dateText: data.dateText || null
            };
        } catch (error) {
            console.error('Fehler beim Abrufen der Daten:', error);
            throw error;
        }
    }

    static async fetchDataForMultipleDates(dates) {
        try {
            // Für 4 Schultage verwende /api/days (lädt alle 4 Tage auf einmal)
            // Dies ist effizienter als 4 separate Requests
            const response = await fetch(API.DAYS);
            if (!response.ok) throw new Error('Netzwerkantwort war nicht ok');
            
            const data = await response.json();
            
            // Erstelle Mapping von datum (YYYY-MM-DD) zu dateText aus JSON
            this.dateToDateTextMap = {};
            if (data.dates && Array.isArray(data.dates)) {
                data.dates.forEach(d => {
                    if (d.date && d.dateText) {
                        this.dateToDateTextMap[d.date] = d.dateText;
                    }
                });
            }
            
            return {
                data: (data.data || []).filter(item => item.kurs?.trim()),
                courses: (data.courses || []).filter(Boolean).sort(),
                dates: data.dates || null // Array mit {date, dateText} für jeden Tag
            };
        } catch (error) {
            console.error('Fehler beim Abrufen der Daten:', error);
            throw error;
        }
    }

    static async fetchData(mode, dateOrDates) {
        try {
            let result;

            if (mode === 'both') {
                // dateOrDates ist jetzt ein Array von Datumsstrings
                const dates = Array.isArray(dateOrDates) ? dateOrDates : [dateOrDates];
                result = await this.fetchDataForMultipleDates(dates);
                this.currentMode = 'both';
                this.currentDates = dates;
                this.currentDate = null;
                this.currentDateText = null;
                // Speichere die gescrapten Datums-Texte
                if (result.dates && Array.isArray(result.dates)) {
                    this.currentDatesText = result.dates.map(d => d.dateText || null);
                } else {
                    this.currentDatesText = null;
                }
            } else {
                result = await this.fetchDataForDate(dateOrDates);
                this.currentMode = 'single';
                this.currentDate = dateOrDates;
                this.currentDates = null;
                this.currentDateText = result.dateText || null;
                this.currentDatesText = null;
                // Erstelle Mapping für single mode
                this.dateToDateTextMap = {};
                if (result.dateText && dateOrDates) {
                    this.dateToDateTextMap[dateOrDates] = result.dateText;
                }
            }
            
            this.allData = result.data;
            return result;
        } catch (error) {
            console.error('Fehler beim Abrufen der Daten:', error);
            throw error;
        }
    }

    static filterData(selectedCourse) {
        let filteredData = selectedCourse === 'all' 
            ? this.allData 
            : this.allData.filter(item => item.kurs.trim() === selectedCourse.trim());
        
        if (this.currentSortColumn) {
            filteredData = this.sortData(filteredData, this.currentSortColumn, this.isAscending);
        }
        
        return filteredData;
    }

    static sortData(data, column, ascending) {
        return [...data].sort((a, b) => {
            const aVal = (a[column] || '').toString().trim().toLowerCase();
            const bVal = (b[column] || '').toString().trim().toLowerCase();
            
            // Numerische Sortierung für die Stunde
            if (column === 'stunde') {
                const aNum = parseInt(aVal) || 0;
                const bNum = parseInt(bVal) || 0;
                return ascending ? aNum - bNum : bNum - aNum;
            }
            
            // Alphabetische Sortierung für andere Spalten
            return ascending 
                ? aVal.localeCompare(bVal) 
                : bVal.localeCompare(aVal);
        });
    }
}

// UI-Management
class UIManager {
    static updateDateDisplay(mode, dateOrDates) {
        if (mode === 'both') {
            // dateOrDates ist jetzt ein Array von Datumsstrings
            const dates = Array.isArray(dateOrDates) ? dateOrDates : [dateOrDates];
            
            // Verwende gescraptes Datum direkt aus dem Mapping, falls verfügbar
            let dateTexts = dates.map(dateStr => {
                // Verwende direkt das dateText aus dem JSON-Mapping
                if (DataManager.dateToDateTextMap[dateStr]) {
                    return DataManager.dateToDateTextMap[dateStr];
                    }
                // Fallback: Berechne Datum nur wenn nicht im Mapping vorhanden
                const dateObj = DateManager.stringToDate(dateStr);
                    return DateManager.formatDate(dateObj);
                });
            
            // Zeige die ersten 2 und letzten 2 Tage, oder alle wenn weniger als 4
            if (dates.length <= 2) {
                DOM.date.textContent = dateTexts.join(' und ');
            } else {
                DOM.date.textContent = `${dateTexts[0]}, ${dateTexts[1]}, ${dateTexts[2]} und ${dateTexts[3]}`;
            }
        } else {
            // Verwende gescraptes Datum direkt aus dem Mapping, falls verfügbar
            if (dateOrDates && DataManager.dateToDateTextMap[dateOrDates]) {
                DOM.date.textContent = DataManager.dateToDateTextMap[dateOrDates];
            } else if (DataManager.currentDateText) {
                DOM.date.textContent = DataManager.currentDateText;
            } else {
                // Fallback: Berechne Datum nur wenn nicht im Mapping vorhanden
                const dateObj = DateManager.stringToDate(dateOrDates);
                DOM.date.textContent = DateManager.formatDate(dateObj);
            }
        }

        // Zeige/Verstecke die Datumsspalte
        document.querySelectorAll('.date-column').forEach(el => {
            el.style.display = mode === 'both' ? '' : 'none';
        });
    }

    static updateDatePicker(date) {
        if (date) {
            CustomDatePicker.setDate(date);
        } else {
            // Reset auf "Datum wählen"
            CustomDatePicker.reset();
        }
    }

    static setBothDaysButtonActive(active) {
        DOM.bothDaysButton.classList.toggle('active', active);
    }

    static setDatePickerActive(active) {
        DOM.datePickerTrigger.classList.toggle('active', active);
    }

    static updateCourseFilter(courses) {
        DOM.courseFilter.innerHTML = '<option value="all">Wähle einen Kurs</option>';
        courses.sort().forEach(course => {
            const option = document.createElement('option');
            option.value = course;
            option.textContent = course;
            DOM.courseFilter.appendChild(option);
        });
    }

    static updateSortIndicators(column) {
        const headers = document.querySelectorAll('th');
        headers.forEach(header => {
            header.classList.remove('sorted-asc', 'sorted-desc');
            if (header.dataset.sort === column) {
                header.classList.add(
                    DataManager.isAscending ? 'sorted-asc' : 'sorted-desc'
                );
            }
        });
    }

    static getDateTextForDate(dateStr) {
        // Verwende direkt das dateText aus dem JSON-Mapping
        if (dateStr && DataManager.dateToDateTextMap[dateStr]) {
            const dateText = DataManager.dateToDateTextMap[dateStr];
            
        // Im "both" Modus (4 Tage) nur Wochentag anzeigen
            if (DataManager.currentMode === 'both') {
                // Extrahiere nur den Wochentag aus dateText (z.B. "Freitag, 19.12.2025" -> "Freitag")
                const weekdayMatch = dateText.match(/^([A-Za-zäöüÄÖÜß]+),/);
                if (weekdayMatch) {
                    return weekdayMatch[1];
                }
                return dateText;
            } else {
                // Im single mode das vollständige Datum anzeigen
                return dateText;
            }
        }
        
        // Fallback: Nur wenn kein dateText im Mapping vorhanden ist
        if (dateStr) {
            return DateManager.formatDateFromString(dateStr);
        }
        return '-';
    }

    static renderData(data) {
        if (!data || data.length === 0) {
            this.showMessage('Keine Daten verfügbar');
            return;
        }

        DOM.dataBody.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            const dateText = item.datum ? this.getDateTextForDate(item.datum) : '-';
            row.innerHTML = `
                <td>${item.kurs || '-'}</td>
                <td class="date-column" ${DataManager.currentMode !== 'both' ? 'style="display:none"' : ''}>
                    ${dateText}
                </td>
                <td>${item.stunde || '-'}</td>
                <td>${item.raum || '-'}</td>
                <td>${item.lehrer || '-'}</td>
                <td>${item.typ || '-'}</td>
                <td>${item.notizen || '-'}</td>
            `;
            DOM.dataBody.appendChild(row);
        });
    }

    static showMessage(message) {
        const colspan = DataManager.currentMode === 'both' ? 7 : 6;
        DOM.dataBody.innerHTML = `
            <tr>
                <td colspan="${colspan}" style="text-align: center; padding: 20px;">
                    ${message}
                </td>
            </tr>
        `;
    }

    static showLoadingIndicator() {
        if (DOM.loadingIndicator) {
            DOM.loadingIndicator.classList.add('visible');
            DOM.loadingIndicator.setAttribute('aria-hidden', 'false');
        }
    }

    static hideLoadingIndicator() {
        if (DOM.loadingIndicator) {
            DOM.loadingIndicator.classList.remove('visible');
            DOM.loadingIndicator.setAttribute('aria-hidden', 'true');
        }
    }
}

// Storage-Management
class StorageManager {
    static isUpdatingHash = false;

    static saveSelectedCourse(course) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_COURSE, course);
        this.updateUrlHash();
    }

    static saveSelectedDate(date) {
        if (date) {
            localStorage.setItem(STORAGE_KEYS.SELECTED_DATE, date);
        } else {
            localStorage.removeItem(STORAGE_KEYS.SELECTED_DATE);
        }
        this.updateUrlHash();
    }

    static loadSelectedCourse() {
        const hash = this.parseUrlHash();
        if (hash.course) {
            try {
                return decodeURIComponent(hash.course);
            } catch (e) {
                console.error("Fehler beim Dekodieren des Kurses aus Hash:", e);
                return hash.course;
            }
        }
        return localStorage.getItem(STORAGE_KEYS.SELECTED_COURSE) || 'all';
    }

    static loadSelectedDate() {
        const hash = this.parseUrlHash();
        if (hash.date) {
            return hash.date;
        }
        return localStorage.getItem(STORAGE_KEYS.SELECTED_DATE) || null;
    }

    static parseUrlHash() {
        // Get hash without the leading #
        const hash = decodeURIComponent(window.location.hash.slice(1));
        console.log("Parsing hash:", hash);
        
        const parts = hash.split(';');
        const result = { course: null, date: null };
        
        parts.forEach(part => {
            if (part.startsWith('date=')) {
                result.date = part.split('=')[1];
            } else if (part && !part.includes('=')) {
                result.course = part;
            }
        });
        
        console.log("Parsed hash result:", result);
        return result;
    }

    static updateUrlHash() {
        if (this.isUpdatingHash) return;
        
        try {
            this.isUpdatingHash = true;
            
            const course = localStorage.getItem(STORAGE_KEYS.SELECTED_COURSE);
            const date = localStorage.getItem(STORAGE_KEYS.SELECTED_DATE);
            let hash = '';

            if (course && course !== 'all') {
                hash = encodeURIComponent(course);
            }
            if (date) {
                hash = hash ? `${hash};date=${date}` : `date=${date}`;
            }

            // Only update if hash actually changed
            const currentHash = window.location.hash.slice(1);
            if (currentHash !== hash) {
                console.log("Updating hash to:", hash);
                if (hash) {
                    history.replaceState(null, document.title, `#${hash}`);
                } else {
                    history.replaceState(null, document.title, window.location.pathname + window.location.search);
                }
            }
        } finally {
            this.isUpdatingHash = false;
        }
    }
}

// Event-Handler
class EventHandler {
    static isHandlingHashChange = false;
    
    static async init() {
        console.log("Initial URL hash:", window.location.hash);
        
        // Event-Listener für Datumauswahl
        DOM.datePicker.addEventListener('change', () => this.handleDatePickerChange());
        DOM.bothDaysButton.addEventListener('click', () => this.handleBothDaysClick());
        DOM.courseFilter.addEventListener('change', () => this.handleCourseChange());
        
        // Pfeil-Rotation für Kurs-Picker
        let isOpen = false;
        
        DOM.courseFilter.addEventListener('mousedown', () => {
            if (!isOpen) {
                isOpen = true;
                DOM.courseFilter.classList.add('open');
            }
        });
        
        DOM.courseFilter.addEventListener('focus', () => {
            isOpen = true;
            DOM.courseFilter.classList.add('open');
        });
        
        DOM.courseFilter.addEventListener('blur', () => {
            isOpen = false;
            DOM.courseFilter.classList.remove('open');
        });
        
        DOM.courseFilter.addEventListener('change', () => {
            // Klasse entfernen nach Auswahl
            setTimeout(() => {
                isOpen = false;
                DOM.courseFilter.classList.remove('open');
            }, 150);
        });

        // Listen for hash changes
        window.addEventListener('hashchange', (e) => {
            console.log("Hash changed:", e.newURL);
            this.handleHashChange();
        });

        // Sortier-Event-Listener hinzufügen
        document.querySelectorAll('th[data-sort]').forEach(header => {
            header.addEventListener('click', () => this.handleSort(header.dataset.sort));
        });

        // Initial load - Standard: beide Tage (heute und morgen)
        const hashData = StorageManager.parseUrlHash();
        await this.handleInitialLoad(hashData);
    }

    static async handleInitialLoad(hashData) {
        const savedDate = StorageManager.loadSelectedDate();
        
        if (savedDate && hashData.date !== savedDate) {
            // Einzelnes Datum aus Hash oder Storage
            await this.loadSingleDate(savedDate, hashData.course);
        } else if (hashData.date) {
            // Datum aus Hash
            await this.loadSingleDate(hashData.date, hashData.course);
        } else {
            // Standard: beide Tage (heute und morgen)
            await this.loadBothDays(hashData.course);
        }
    }
    
    static async loadSingleDate(date, initialCourse = null) {
        try {
            UIManager.showLoadingIndicator();
            UIManager.updateDatePicker(date);
            UIManager.setBothDaysButtonActive(false);
            UIManager.setDatePickerActive(true);

            // Fetch data
            const data = await DataManager.fetchData('single', date);
            
            // Aktualisiere Datumsanzeige mit gescraptem Datum
            UIManager.updateDateDisplay('single', date);
            
            UIManager.updateCourseFilter(data.courses);
            
            // Set course selection
            const courseToSelect = this.selectCourse(data.courses, initialCourse);
            DOM.courseFilter.value = courseToSelect;
            
            // Update storage
            StorageManager.saveSelectedDate(date);
            if (courseToSelect !== 'all') {
                StorageManager.saveSelectedCourse(courseToSelect);
            }
            
            // Filter and render data
            const filteredData = DataManager.filterData(courseToSelect);
            UIManager.renderData(filteredData);
            
        } catch (error) {
            console.error('Fehler beim Laden der Daten:', error);
            UIManager.showMessage('Fehler beim Laden der Daten');
        } finally {
            UIManager.hideLoadingIndicator();
        }
    }

    static async loadBothDays(initialCourse = null) {
        try {
            UIManager.showLoadingIndicator();

            UIManager.updateDatePicker(null); // Reset auf heutiges Datum
            UIManager.setBothDaysButtonActive(true);
            UIManager.setDatePickerActive(false);

            // Fetch data - verwende Standard-Endpunkt für 4 Schultage
            const response = await fetch(API.DAYS);
            if (!response.ok) throw new Error('Netzwerkantwort war nicht ok');
            const data = await response.json();
            
            DataManager.allData = (data.data || []).filter(item => item.kurs?.trim());
            DataManager.currentMode = 'both';
            DataManager.currentDate = null;
            
            // Verwende die tatsächlichen Daten aus dem JSON statt berechnete Daten
            let dates = [];
            DataManager.dateToDateTextMap = {};
            if (data.dates && Array.isArray(data.dates)) {
                // Extrahiere die Datumsstrings direkt aus dem JSON
                dates = data.dates.map(d => d.date).filter(Boolean);
                DataManager.currentDates = dates;
                DataManager.currentDatesText = data.dates.map(d => d.dateText || null);
                // Erstelle Mapping für direkten Zugriff
                data.dates.forEach(d => {
                    if (d.date && d.dateText) {
                        DataManager.dateToDateTextMap[d.date] = d.dateText;
                    }
                });
            } else {
                // Fallback: Berechne Daten nur wenn JSON keine Daten hat
                const defaultDates = DateManager.getDefaultDates();
                dates = defaultDates.dates;
                DataManager.currentDates = dates;
                DataManager.currentDatesText = null;
            }
            
            // Aktualisiere Datumsanzeige mit gescraptem Datum
            UIManager.updateDateDisplay('both', dates);
            
            UIManager.updateCourseFilter(data.courses || []);
            
            // Set course selection
            const courseToSelect = this.selectCourse(data.courses || [], initialCourse);
            DOM.courseFilter.value = courseToSelect;
            
            // Update storage - kein einzelnes Datum gespeichert
            StorageManager.saveSelectedDate(null);
            if (courseToSelect !== 'all') {
                StorageManager.saveSelectedCourse(courseToSelect);
            }
            
            // Filter and render data
            const filteredData = DataManager.filterData(courseToSelect);
            UIManager.renderData(filteredData);
            
        } catch (error) {
            console.error('Fehler beim Laden der Daten:', error);
            UIManager.showMessage('Fehler beim Laden der Daten');
        } finally {
            UIManager.hideLoadingIndicator();
        }
    }

    static selectCourse(availableCourses, initialCourse) {
        let courseToSelect = 'all';
        
        // First priority: URL hash course if specified
        if (initialCourse) {
            const matchingCourse = this.findCourseMatch(availableCourses, initialCourse);
            if (matchingCourse) {
                courseToSelect = matchingCourse;
                console.log("Using course from hash:", courseToSelect);
            }
        } else {
            // Second priority: Stored course preference
            const savedCourse = localStorage.getItem(STORAGE_KEYS.SELECTED_COURSE);
            if (savedCourse && (availableCourses.includes(savedCourse) || savedCourse === 'all')) {
                courseToSelect = savedCourse;
                console.log("Using saved course:", courseToSelect);
            }
        }
        
        return courseToSelect;
    }

    static handleDatePickerChange() {
        const selectedDate = DOM.datePicker.value;
        if (selectedDate) {
            const hashData = StorageManager.parseUrlHash();
            this.loadSingleDate(selectedDate, hashData.course);
        }
    }

    static handleBothDaysClick() {
        const hashData = StorageManager.parseUrlHash();
        this.loadBothDays(hashData.course);
    }

    static handleCourseChange(updateHash = true) {
        const selectedCourse = DOM.courseFilter.value;
        
        // Nur URL-Hash aktualisieren, wenn dies explizit angefordert wird
        if (updateHash) {
            localStorage.setItem(STORAGE_KEYS.SELECTED_COURSE, selectedCourse);
            StorageManager.updateUrlHash();
        }
        
        const filteredData = DataManager.filterData(selectedCourse);
        UIManager.renderData(filteredData);
    }

    static handleHashChange() {
        if (this.isHandlingHashChange) return;
        
        try {
            this.isHandlingHashChange = true;
            
            const hashData = StorageManager.parseUrlHash();
            
            if (hashData.date) {
                // Einzelnes Datum aus Hash
                this.loadSingleDate(hashData.date, hashData.course);
            } else {
                // Standard: beide Tage
                this.loadBothDays(hashData.course);
            }
        } finally {
            this.isHandlingHashChange = false;
        }
    }
    
    // Case-insensitive matching for course selection
    static findCourseMatch(availableCourses, targetCourse) {
        if (!targetCourse) return null;
        
        // Try direct match first
        if (availableCourses.includes(targetCourse)) {
            return targetCourse;
        }
        
        // Try case-insensitive match
        const lowercaseTarget = targetCourse.toLowerCase();
        const match = availableCourses.find(course => 
            course.toLowerCase() === lowercaseTarget);
        
        return match || null;
    }

    static handleSort(column) {
        if (DataManager.currentSortColumn === column) {
            DataManager.isAscending = !DataManager.isAscending;
        } else {
            DataManager.currentSortColumn = column;
            DataManager.isAscending = true;
        }

        UIManager.updateSortIndicators(column);
        this.handleCourseChange();
    }
}

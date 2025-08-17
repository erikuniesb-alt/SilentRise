// ----------------------
// Navigation
// ----------------------
function zeigeSeite(id, button) {
  document.querySelectorAll('main > div').forEach(div => div.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');

  document.querySelectorAll('footer button').forEach(btn => {
    btn.classList.remove('active-tab');
    btn.classList.add('inactive-tab');
  });
  button.classList.add('active-tab');
  button.classList.remove('inactive-tab');

    if (id === "seite-vibrationstest") {
    const btnTestAnna   = document.getElementById("vibtest-anna");
    const btnTestMarkus = document.getElementById("vibtest-markus");

    if (btnTestAnna && btnTestMarkus) {
      btnTestAnna.onclick   = () => startVibrationTest("Anna");
      btnTestMarkus.onclick = () => startVibrationTest("Markus");
    }
  }
}

// ----------------------
// State & Speicherung
// ----------------------
const state = {
  aktivePerson: null,
  weckzeiten: JSON.parse(localStorage.getItem("weckzeit")) || {
    Anna: { stunden: 7, minuten: 0 },
    Markus: { stunden: 7, minuten: 0 }
  },
  toggles: JSON.parse(localStorage.getItem("weckerToggles")) || {
    Anna: true,
    Markus: true
  },
  schlafplanAktiv: JSON.parse(localStorage.getItem("schlafplanAktiv")) || {
    Anna: true,
    Markus: true
  },
  schlafplanZeiten: JSON.parse(localStorage.getItem("schlafplanZeiten")) || {
    Anna: [null, null, null, null, null, null, null],
    Markus: [null, null, null, null, null, null, null]
  },
  einstellungen: JSON.parse(localStorage.getItem("einstellungen")) || {
    p1Staerke: 50,
    p1Schlummer: 5,
    p2Staerke: 75,
    p2Schlummer: 10,
    bettseiteLinks: "Anna",
    bettseiteRechts: "Markus"
  },
  aktuellerTagIndex: null
};

let syncInterval = null;

let currentAlarmPerson = null;   // "Anna" | "Markus" | null
let snoozeSecondsLeft  = 0;      // Rest-Sekunden bis zum erneuten Klingeln
let snoozeTimer        = null;   // setInterval-ID für den Countdown

function saveState() {
  localStorage.setItem("weckzeit", JSON.stringify(state.weckzeiten));
  localStorage.setItem("weckerToggles", JSON.stringify(state.toggles));
  localStorage.setItem("schlafplanAktiv", JSON.stringify(state.schlafplanAktiv));
  localStorage.setItem("schlafplanZeiten", JSON.stringify(state.schlafplanZeiten));
}

function saveEinstellungen() {
  localStorage.setItem("einstellungen", JSON.stringify(state.einstellungen));
}

// ----------------------
// Bluetooth-Handling
// ----------------------
class SilentRiseBluetooth {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.serviceUUID = "12345678-1234-5678-1234-56789abcdef0";
    this.characteristicUUID = "12345678-1234-5678-1234-56789abcdef1";
  }

  async connect() {
  try {
    // Gerät nach Name suchen (wie im funktionierenden Testcode)
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'SilentRise-ESP32' }],   // Name-Filter
      optionalServices: [this.serviceUUID]       // Service später abrufen
    });

    // Verbindung aufbauen
    this.server = await this.device.gatt.connect();

    // Service & Characteristic holen
    const service = await this.server.getPrimaryService(this.serviceUUID);
    this.characteristic = await service.getCharacteristic(this.characteristicUUID);

        // Notifications aktivieren
    await this.characteristic.startNotifications();
    this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const value = new TextDecoder().decode(event.target.value);
      console.log("Notify erhalten:", value);

     if (value.startsWith("ALARM")) {           // <-- NEU
    const [, person] = value.split("|");     // person = "Anna" / "Markus" / undefined
    zeigeAlarmPopup(person);                 // Popup öffnen
  } else if (value === "STOP") {
    hideAlarmPopup();
  }
    });


    // UI-Update
    document.getElementById("bt-status").textContent = "Verbunden";
    document.getElementById("bt-status").classList.remove("text-gray-500");
    document.getElementById("bt-status").classList.add("text-green-600");
    document.getElementById("bt-button").textContent = "Trennen";
    document.getElementById("bt-device").textContent = this.device.name || "SilentRise Wecker";

    console.log("Bluetooth verbunden mit", this.device.name);

    // Nach Verbindung sofort Daten senden
    await this.sendData(getCurrentConfigData());

    // Alle 5 Minuten aktuelle Uhrzeit und Einstellungen erneut senden
if (syncInterval) clearInterval(syncInterval);
syncInterval = setInterval(() => {
  if (this.characteristic) {
    this.sendData(getCurrentConfigData());
    console.log("Uhrzeit erneut gesendet (5-Minuten-Sync)");
  }
}, 5 * 60 * 1000);

  } catch (error) {
    console.error("Bluetooth Verbindung fehlgeschlagen:", error);
  }
}

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
      console.log("Bluetooth getrennt");
    }

    // UI-Update
    document.getElementById("bt-status").textContent = "Nicht verbunden";
    document.getElementById("bt-status").classList.remove("text-green-600");
    document.getElementById("bt-status").classList.add("text-gray-500");
    document.getElementById("bt-button").textContent = "Verbinden";
    document.getElementById("bt-device").textContent = "Kein Gerät ausgewählt";
  }

  async sendData(dataObj) {
    if (!this.characteristic) {
      console.error("Keine Bluetooth-Verbindung aktiv.");
      return;
    }

    const jsonString = JSON.stringify(dataObj);
    const encoder = new TextEncoder();
    await this.characteristic.writeValue(encoder.encode(jsonString));
    console.log("Gesendet:", jsonString);
  }
}

// Instanz global anlegen
const btManager = new SilentRiseBluetooth();

function getCurrentConfigData() {
  const now = new Date();

  return {
    currentTime: {
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds()
    },
    anna: {
      hour: state.weckzeiten.Anna.stunden,
      minute: state.weckzeiten.Anna.minuten,
      strength: state.einstellungen.p1Staerke,
      snooze: state.einstellungen.p1Schlummer,
      enabled: !!state.toggles.Anna 
    },
    markus: {
      hour: state.weckzeiten.Markus.stunden,
      minute: state.weckzeiten.Markus.minuten,
      strength: state.einstellungen.p2Staerke,
      snooze: state.einstellungen.p2Schlummer,
      enabled: !!state.toggles.Markus
    },
    bed: {
      left: state.einstellungen.bettseiteLinks,
      right: state.einstellungen.bettseiteRechts
    }
  };
}

function sendCurrentConfigToESP() {
  // Prüfen, ob Verbindung existiert
  if (!btManager || !btManager.characteristic) {
    console.log("Bluetooth nicht verbunden, kein Senden möglich");
    return;
  }
  // Aktuelle Daten holen und senden
  const config = getCurrentConfigData();
  btManager.sendData(config);
}


// ----------------------
// DOM Elemente
// ----------------------
const stundenScroll = document.getElementById("stunden-scroll");
const minutenScroll = document.getElementById("minuten-scroll");
const scrollContainer = document.getElementById("scrollrad-container");

const zeitAnna = document.getElementById("zeit-anna");
const zeitMarkus = document.getElementById("zeit-markus");

const toggleAnna = document.getElementById("toggle-anna");
const toggleMarkus = document.getElementById("toggle-markus");

const toggleAnnaPlan = document.getElementById("toggle-anna-plan");
const toggleMarkusPlan = document.getElementById("toggle-markus-plan");

// ----------------------
// Scrollrad (Wecker) generieren
// ----------------------
function generateScrollLists() {
  for (let repeat = 0; repeat < 5; repeat++) {
    for (let i = 0; i < 24; i++) {
      const div = document.createElement("div");
      div.textContent = i.toString().padStart(2, "0");
      div.className = "scroll-item";
      stundenScroll.appendChild(div);
    }
  }

  for (let repeat = 0; repeat < 5; repeat++) {
    for (let i = 0; i < 60; i += 5) {
      const div = document.createElement("div");
      div.textContent = i.toString().padStart(2, "0");
      div.className = "scroll-item";
      minutenScroll.appendChild(div);
    }
  }
}

// ----------------------
// Highlight aktive Zahl Wecker
// ----------------------
function highlightActiveNumbers() {
  if (!state.aktivePerson) return;

  const { stunden, minuten } = state.weckzeiten[state.aktivePerson];

  Array.from(stundenScroll.children).forEach((item, i) => {
    if (i % 24 === stunden) item.classList.add("active");
    else item.classList.remove("active");
  });

  const minutenIndex = minuten / 5;
  Array.from(minutenScroll.children).forEach((item, i) => {
    if (i % 12 === minutenIndex) item.classList.add("active");
    else item.classList.remove("active");
  });
}

// ----------------------
// Übersicht aktualisieren
// ----------------------
function updateOverview() {
  zeitAnna.textContent = `${state.weckzeiten.Anna.stunden.toString().padStart(2, "0")}:${state.weckzeiten.Anna.minuten.toString().padStart(2, "0")}`;
  zeitMarkus.textContent = `${state.weckzeiten.Markus.stunden.toString().padStart(2, "0")}:${state.weckzeiten.Markus.minuten.toString().padStart(2, "0")}`;

  toggleAnna.checked = state.toggles.Anna;
  toggleMarkus.checked = state.toggles.Markus;

  if (toggleAnnaPlan && toggleMarkusPlan) {
    toggleAnnaPlan.checked = state.schlafplanAktiv.Anna;
    toggleMarkusPlan.checked = state.schlafplanAktiv.Markus;
  }

  highlightActiveNumbers();
  updateNextAlarmText();
  updateUebersichtTage();
}

// ----------------------
// Nächster Alarm berechnen
// ----------------------
function updateNextAlarmText() {

  const now = new Date();
  let nextAlarmTime = null;

  if (state.toggles.Anna) {
    const annaDate = new Date(now);
    annaDate.setHours(state.weckzeiten.Anna.stunden, state.weckzeiten.Anna.minuten, 0, 0);
    if (annaDate <= now) annaDate.setDate(annaDate.getDate() + 1);
    nextAlarmTime = annaDate;
  }

  if (state.toggles.Markus) {
    const markusDate = new Date(now);
    markusDate.setHours(state.weckzeiten.Markus.stunden, state.weckzeiten.Markus.minuten, 0, 0);
    if (markusDate <= now) markusDate.setDate(markusDate.getDate() + 1);

    if (!nextAlarmTime || markusDate < nextAlarmTime) {
      nextAlarmTime = markusDate;
    }
  }

  const output = document.getElementById("naechster-wecker-text");
  if (output) {
    if (nextAlarmTime) {
      const diffMs = nextAlarmTime - now;
     // gesamte Differenz in MINUTEN, aufgerundet
const totalMin = Math.ceil(diffMs / 60_000);

const diffH = Math.floor(totalMin / 60);   // ganze Stunden
const diffM = totalMin % 60;               // Rest-Minuten

      output.textContent = `Der nächste Wecker weckt sanft in ${diffH} h ${diffM} min`;
    } else {
      output.textContent = "Kein Wecker aktiviert";
    }
  }
}

// 1) Countdown sofort initial anzeigen
updateNextAlarmText();

// 2) Zeit bis zum nächsten vollen Minuten-Tick berechnen
const now            = new Date();
const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

// 3) Genau am Minutenwechsel starten wir das Dauertimer-Intervall
setTimeout(() => {
  updateNextAlarmText();                      // erstes Update (sekundengenau)

  // ab jetzt jede volle Minute neu berechnen
  setInterval(updateNextAlarmText, 60 * 1000);
}, msToNextMinute);


// ------------------------------------------------------------------
// Permanenter Countdown-Timer  ➜  wird direkt nach dem Laden gestartet
// ------------------------------------------------------------------
setInterval(updateNextAlarmText, 30 * 1000);   // alle 30 s (oder 60 000 ms)



// ----------------------
// Scrollposition Wecker setzen
// ----------------------
let isSettingPosition = false;
let isSettingSmallWheel = false;

function setScrollPosition() {
  if (!state.aktivePerson) return;

  isSettingPosition = true;

  const { stunden, minuten } = state.weckzeiten[state.aktivePerson];

  const ITEM_H = 40;                                   // Höhe einer Zeile in px
  // Mitte des Containers minus halbe Zeilenhöhe = Versatz
  const OFFSET = stundenScroll.clientHeight / 2 - ITEM_H / 2;

  // ► Stundenrad
  // 24*2 = zwei Dummy-Durchläufe oberhalb; + stunden = echte Stunde
  stundenScroll.scrollTop = (24 * 2 + stunden) * ITEM_H - OFFSET;

  // ► Minutenrad (Schritte à 5 min, also 12 Elemente pro Stunde)
  minutenScroll.scrollTop = (12 * 2 + minuten / 5) * ITEM_H - OFFSET;

  // kleinen Delay beibehalten
  setTimeout(() => { isSettingPosition = false; }, 100);
}

// ----------------------
// Scroll Listener Wecker
// ----------------------
function setupScrollListener(scrollElement, type) {
  let isJumping = false;
  scrollElement.addEventListener("scroll", () => {
    if (!state.aktivePerson || isJumping || isSettingPosition) return;

    const containerCenter = scrollElement.clientHeight / 2;
    const index = Math.round((scrollElement.scrollTop + containerCenter - 20) / 40);

    const maxItems = type === "stunden" ? 24 : 12;
    const realIndex = index % maxItems;

    if (type === "stunden") {
      state.weckzeiten[state.aktivePerson].stunden = realIndex;
    } else {
      state.weckzeiten[state.aktivePerson].minuten = realIndex * 5;
    }

    saveState();
    updateOverview();
    sendCurrentConfigToESP();

    if (index < maxItems || index >= maxItems * 4) {
      isJumping = true;
      scrollElement.scrollTop = (maxItems * 2 + realIndex) * 40;
      setTimeout(() => (isJumping = false), 0);
    }
  });
}

// ----------------------
// Wecker Bearbeitungsmodus
// ----------------------
function toggleEditMode(person) {
  if (state.aktivePerson === person) {
    state.aktivePerson = null;
    scrollContainer.classList.add("hidden");
    return;
  }

  state.aktivePerson = person;
  scrollContainer.classList.remove("hidden");

  const weckerUebersicht = document.getElementById("wecker-uebersicht");
  const annaBox = zeitAnna.parentElement.parentElement;
  const markusBox = zeitMarkus.parentElement.parentElement;

  if (person === "Anna") weckerUebersicht.insertBefore(scrollContainer, markusBox);
  else weckerUebersicht.appendChild(scrollContainer);

  setScrollPosition();
  requestAnimationFrame(() => highlightActiveNumbers());
  updateOverview();
}

// ----------------------
// Schlafplan Bearbeitungsmodus
// ----------------------
function togglePlanEditMode(person) {
  const feldAnna = document.getElementById("bearbeitung-anna");
  const feldMarkus = document.getElementById("bearbeitung-markus");

  feldAnna.classList.add("hidden");
  feldMarkus.classList.add("hidden");
  feldAnna.innerHTML = "";
  feldMarkus.innerHTML = "";

  document.getElementById("toggle-container-anna").classList.add("toggle-disabled");
  document.getElementById("toggle-container-markus").classList.add("toggle-disabled");

  if (state.aktivePerson === person) {
    state.aktivePerson = null;
    return;
  }

  state.aktivePerson = person;

  const toggleContainer = document.getElementById(
    person === "Anna" ? "toggle-container-anna" : "toggle-container-markus"
  );
  toggleContainer.classList.remove("toggle-disabled");

  const feld = person === "Anna" ? feldAnna : feldMarkus;
  feld.innerHTML = generateBearbeitungsfeldHTML(person);
  feld.classList.remove("hidden");

  setupTageInteraktion(person, feld);
}

// ----------------------
// Bearbeitungsfeld generieren
// ----------------------
function generateBearbeitungsfeldHTML(person) {
  let html = `<div class="bearbeitungsfeld">`;

  const tage = ["Mo","Di","Mi","Do","Fr","Sa","So"];
  html += `<div class="vertikale-tage">`;
  tage.forEach((tag, index) => {
    const aktiv = state.schlafplanZeiten[person][index] !== null ? "aktiv" : "";
    const zeit = state.schlafplanZeiten[person][index]
      ? `${state.schlafplanZeiten[person][index].stunden.toString().padStart(2, "0")}:${state.schlafplanZeiten[person][index].minuten.toString().padStart(2, "0")}`
      : "";
    html += `<div class="tag-container ${aktiv}" data-index="${index}">${tag} <span class="tag-zeit">${zeit}</span></div>`;
  });
  html += `</div>`;

  html += `<div class="scrollrad-wrapper" id="scrollrad-wrapper-${person}">
      <div class="scroll-highlight-bar"></div>
      <div class="scrollrad-klein text-center flex-1" id="stunden-${person}"></div>
      <div class="scrollrad-klein text-center flex-1" id="minuten-${person}"></div>
    </div>`;

  html += `</div>`;
  return html;
}

// ----------------------
// Tage-Interaktion & Scrollrad
// ----------------------
function setupTageInteraktion(person, feld) {
  const tageContainer = feld.querySelectorAll(".tag-container");
  const scrollWrapper = feld.querySelector(`#scrollrad-wrapper-${person}`);
  const stundenEl = scrollWrapper.querySelector(`#stunden-${person}`);
  const minutenEl = scrollWrapper.querySelector(`#minuten-${person}`);

  scrollWrapper.style.display = "none";

  stundenEl.innerHTML = "";
  minutenEl.innerHTML = "";

  function generateSmallScroll(el, max, step = 1) {
    for (let repeat = 0; repeat < 5; repeat++) {
      for (let i = 0; i < max; i += step) {
        const div = document.createElement("div");
        div.textContent = i.toString().padStart(2, "0");
        div.className = "scroll-item";
        el.appendChild(div);
      }
    }
  }
  generateSmallScroll(stundenEl, 24);
  generateSmallScroll(minutenEl, 60, 5);

  tageContainer.forEach(tag => {
    tag.addEventListener("click", () => {
      const index = parseInt(tag.dataset.index);

      if (tag.classList.contains("aktiv")) {
        tag.classList.remove("aktiv");
        state.schlafplanZeiten[person][index] = null;
        state.aktuellerTagIndex = null;
        scrollWrapper.style.display = "none";
        saveState();
        tag.querySelector(".tag-zeit").textContent = "";
        updateUebersichtTage();
        return;
      }

      if (!state.schlafplanZeiten[person][index]) {
        state.schlafplanZeiten[person][index] = { stunden: 0, minuten: 0 };
      }

      tag.classList.add("aktiv");
      state.aktuellerTagIndex = index;
      saveState();

      const top = tag.offsetTop;
      scrollWrapper.style.top = `${top}px`;
      scrollWrapper.style.display = "flex";

      const zeit = state.schlafplanZeiten[person][index];
      zeit.minuten = Math.round(zeit.minuten / 5) * 5;
      setSmallScrollPosition(stundenEl, minutenEl, zeit);

      updateUebersichtTage();
    });
  });

  setupSmallScrollListener(stundenEl, "stunden", person);
  setupSmallScrollListener(minutenEl, "minuten", person);
}

// ----------------------
// Scrollposition kleines Rad
// ----------------------
function setSmallScrollPosition(stundenEl, minutenEl, zeit) {
  const ITEM   = 30;
  const CENTER = stundenEl.clientHeight/2;

  isSettingSmallWheel = true;

  const idxH = zeit.stunden ?? 0;
  stundenEl.scrollTop = (24*2 + idxH) * ITEM + ITEM/2 - CENTER;

  const idxM = (zeit.minuten ?? 0) / 5;
  minutenEl.scrollTop = (12*2 + idxM) * ITEM + ITEM/2 - CENTER;

  requestAnimationFrame(() => { isSettingSmallWheel = false; });
}

// ----------------------
// Scroll Listener kleines Rad
// ----------------------
function setupSmallScrollListener(scrollElement, type, person) {
  let isJumping = false;
  scrollElement.addEventListener("scroll", () => {
    if (state.aktuellerTagIndex === null) return;
    const index = state.aktuellerTagIndex;

    const containerCenter = scrollElement.clientHeight / 2;
    const posIndex = Math.floor((scrollElement.scrollTop + containerCenter) / 30);

    const maxItems = type === "stunden" ? 24 : 12;
    const realIndex = posIndex % maxItems;

    if (type === "stunden") {
      state.schlafplanZeiten[person][index].stunden = realIndex;
    } else {
      state.schlafplanZeiten[person][index].minuten = realIndex * 5;
    }

    saveState();
    sendCurrentConfigToESP();

    const feld = document.getElementById(`bearbeitung-${person.toLowerCase()}`);
    const tagElem = feld.querySelector(`.tag-container[data-index="${index}"] .tag-zeit`);
    tagElem.textContent = `${state.schlafplanZeiten[person][index].stunden.toString().padStart(2, "0")}:${state.schlafplanZeiten[person][index].minuten.toString().padStart(2, "0")}`;

    if (posIndex < maxItems || posIndex >= maxItems * 3) {
      isJumping = true;
      scrollElement.scrollTop = (maxItems * 2 + realIndex) * 30;
      setTimeout(() => (isJumping = false), 0);
    }
  });
}

// ----------------------
// Übersicht-Tage Hauptkarten
// ----------------------
function updateUebersichtTage() {
  ["Anna","Markus"].forEach(person => {
    const card = document.getElementById(
      person === "Anna" ? "card-anna-schlafplan" : "card-markus-schlafplan"
    );
    const spans = card.querySelectorAll("div.flex.gap-2 span");

    spans.forEach((span, i) => {
      if (state.schlafplanZeiten[person][i]) {
        span.classList.add("text-black");
        span.classList.remove("text-gray-500");
      } else {
        span.classList.remove("text-black");
        span.classList.add("text-gray-500");
      }
    });
  });
}

// ----------------------
// Einstellungen Slider (Live-Update + Speichern)
// ----------------------
function setupSliderLiveUpdate() {
  const p1Staerke = document.getElementById("p1-staerke");
  const p1StaerkeWert = document.getElementById("p1-staerke-wert");
  const p1Schlummer = document.getElementById("p1-schlummer");
  const p1SchlummerWert = document.getElementById("p1-schlummer-wert");

  const p2Staerke = document.getElementById("p2-staerke");
  const p2StaerkeWert = document.getElementById("p2-staerke-wert");
  const p2Schlummer = document.getElementById("p2-schlummer");
  const p2SchlummerWert = document.getElementById("p2-schlummer-wert");

  // Initialwerte setzen
  p1Staerke.value = state.einstellungen.p1Staerke;
  p1StaerkeWert.textContent = state.einstellungen.p1Staerke;
  p1Schlummer.value = state.einstellungen.p1Schlummer;
  p1SchlummerWert.textContent = state.einstellungen.p1Schlummer;

  p2Staerke.value = state.einstellungen.p2Staerke;
  p2StaerkeWert.textContent = state.einstellungen.p2Staerke;
  p2Schlummer.value = state.einstellungen.p2Schlummer;
  p2SchlummerWert.textContent = state.einstellungen.p2Schlummer;

  // Event Listener für Live-Update und Speichern
  p1Staerke.addEventListener("input", () => {
    state.einstellungen.p1Staerke = +p1Staerke.value;
    p1StaerkeWert.textContent = p1Staerke.value;
    saveEinstellungen();
    sendCurrentConfigToESP();
  });

  p1Schlummer.addEventListener("input", () => {
    state.einstellungen.p1Schlummer = +p1Schlummer.value;
    p1SchlummerWert.textContent = p1Schlummer.value;
    saveEinstellungen();
    sendCurrentConfigToESP();
  });

  p2Staerke.addEventListener("input", () => {
    state.einstellungen.p2Staerke = +p2Staerke.value;
    p2StaerkeWert.textContent = p2Staerke.value;
    saveEinstellungen();
    sendCurrentConfigToESP();
  });

  p2Schlummer.addEventListener("input", () => {
    state.einstellungen.p2Schlummer = +p2Schlummer.value;
    p2SchlummerWert.textContent = p2Schlummer.value;
    saveEinstellungen();
    sendCurrentConfigToESP();
  });
}

/* ------------------------------------------------------------------
   Bettseite – komplett neuer Workflow
   ------------------------------------------------------------------ */

function renderBettseite() {
  const container = document.getElementById("bettseite-auswahl");
  if (!container) return;

  container.innerHTML = "";

  const leftBox  = createBox("links",  state.einstellungen.bettseiteLinks);
  const rightBox = createBox("rechts", state.einstellungen.bettseiteRechts);

  container.appendChild(leftBox);
  container.appendChild(rightBox);

  leftBox .addEventListener("click", () => startEdit("links"));
  rightBox.addEventListener("click", () => startEdit("rechts"));

  /* ---------- Hilfsfunktion ---------- */
 function createBox(side, name, showSide = true) {
  const div = document.createElement("div");
  div.className =
    "text-sm font-medium flex items-center justify-center rounded-xl " +
    "border border-[#dde0e3] px-4 h-11 text-[#121416] cursor-pointer transition";

  div.textContent = showSide
      ? `${name} (${side[0].toUpperCase() + side.slice(1)})`
      : name;                             // ← kein Zusatz im Edit-Modus

  return div;
}
}

/* Edit-Modus ------------------------------------------------------- */
function startEdit(sideClicked) {
  const container    = document.getElementById("bettseite-auswahl");
  const person       = sideClicked === "links"
                         ? state.einstellungen.bettseiteLinks
                         : state.einstellungen.bettseiteRechts;
  const otherPerson  = person === "Anna" ? "Markus" : "Anna";

  /* 1) Layout fürs Editieren -------------------------------------- */
  container.innerHTML = "";
  container.style.flexWrap = "nowrap";      // verhindert Zeilenumbruch
  container.appendChild(createBox("links", person, false));


  // Auswahlfeld „Links / Rechts“
  const chooser = document.createElement("div");
  chooser.className = "flex gap-3 w-full justify-center";
  ["Links", "Rechts"].forEach(label => {
    const btn = document.createElement("div");
    btn.textContent = label;
    btn.className =
      "text-sm font-medium flex items-center justify-center rounded-xl " +
      "border border-[#dde0e3] px-4 h-11 text-[#121416] bg-gray-100 " +
      "cursor-pointer active:scale-95 transition";
    btn.onclick = () => applyChoice(label.toLowerCase());
    chooser.appendChild(btn);
  });
  container.appendChild(chooser);

  /* 2) Entscheidung übernehmen ----------------------------------- */
  function applyChoice(chosenSide) {
    if (chosenSide === "links") {
      state.einstellungen.bettseiteLinks  = person;
      state.einstellungen.bettseiteRechts = otherPerson;
    } else {
      state.einstellungen.bettseiteRechts = person;
      state.einstellungen.bettseiteLinks  = otherPerson;
    }
    saveEinstellungen();
    sendCurrentConfigToESP?.();

    container.style.flexWrap = "";          // zurück zum Standard-Layout
    renderBettseite();
  }

  /* lokale Kopie – benötigt identische Klassen -------------------- */
 function createBox(side, name, showSide = true) {
  const div = document.createElement("div");
  div.className =
    "text-sm font-medium flex items-center justify-center rounded-xl " +
    "border border-[#dde0e3] px-4 h-11 text-[#121416] cursor-pointer transition";

  div.textContent = showSide
      ? `${name} (${side[0].toUpperCase() + side.slice(1)})`
      : name;                             // ← kein Zusatz im Edit-Modus

  return div;
}
}

/* ------------------------------------------------------------------
   Ende Bettseite-Workflow
   ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  const btButton = document.getElementById("bt-button");
  const btStatus = document.getElementById("bt-status");
  const btDevice = document.getElementById("bt-device");


  // Neuen Event-Listener einfügen
  document.getElementById("bt-button").addEventListener("click", async () => {
    const status = document.getElementById("bt-status").textContent;
    if (status === "Nicht verbunden") {
      await btManager.connect();
    } else {
      await btManager.disconnect();
    }
  });
});

// Popup anzeigen/verstecken
let popupClockInterval = null;
let popupClockTimeout  = null;   // einmaliger Timer bis zum nächsten :00


// Popup anzeigen
function zeigeAlarmPopup(person) {
    currentAlarmPerson = person || null;

  // Schlummer-Button zurücksetzen
  const btn = document.getElementById('snooze-btn');
  btn.textContent = 'Schlummern';
  btn.classList.remove('mt-8');

  // Titel & Untertitel zeigen
  document.getElementById('alarm-time')   .classList.remove('invisible');
  document.getElementById('alarm-subtitle').classList.remove('invisible');
  document.getElementById('alarm-subtitle').textContent =
        person ? `Wecker für ${person}` : 'Wecker';

  // Popup einblenden
  document.getElementById('alarm-popup').classList.remove('hidden');

  // Minuten-synchronen Uhr-Timer starten
  startPopupClockTimer();
}

// Popup ausblenden
function hideAlarmPopup() {
  // Timer stoppen
  if (popupClockInterval) {
    clearInterval(popupClockInterval);
    popupClockInterval = null;
  }

  if (popupClockTimeout) {
  clearTimeout(popupClockTimeout);
  popupClockTimeout = null;
}

  // Popup verstecken
  document.getElementById('alarm-popup').classList.add('hidden');
}

// Uhrzeit im Popup aktualisieren
function updatePopupClock() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('alarm-time').textContent = timeString;
}

function updateSnoozeCountdownText() {
  const m = Math.floor(snoozeSecondsLeft / 60).toString().padStart(2, '0');
  const s = (snoozeSecondsLeft % 60).toString().padStart(2, '0');
  document.getElementById('snooze-btn').textContent = `${m}:${s}`;
}

function startPopupClockTimer() {
  // alte Timer löschen
  if (popupClockInterval) clearInterval(popupClockInterval);
  if (popupClockTimeout)  clearTimeout(popupClockTimeout);

  // sofort Uhrzeit setzen
  updatePopupClock();

  // ms bis zum nächsten vollen Minuten-Tick
  const now = new Date();
  const msToNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

  // genau am :00-Tick erneut ausführen, dann jede Minute
  popupClockTimeout = setTimeout(() => {
    updatePopupClock();                               // erstes Update auf :00
    popupClockInterval = setInterval(updatePopupClock, 60 * 1000);
  }, msToNextMinute);
}


// Schlummern drücken
function schlummern() {

  if (snoozeTimer) return; 
  
   // 1 Snooze-Dauer ermitteln
  const mins = currentAlarmPerson === 'Markus'
                 ? state.einstellungen.p2Schlummer
                 : state.einstellungen.p1Schlummer;
  snoozeSecondsLeft = mins * 60;

  // 2 Uhr & Untertitel ausblenden, Button als Countdown nutzen
  document.getElementById('alarm-time')   .classList.add('invisible');
  document.getElementById('alarm-subtitle').classList.add('invisible');

  const btn = document.getElementById('snooze-btn');
  // btn.classList.add('mt-8');
  updateSnoozeCountdownText();

  // 3 Sekunden-Timer starten
  if (snoozeTimer) clearInterval(snoozeTimer);
  snoozeTimer = setInterval(() => {
    snoozeSecondsLeft--;
    updateSnoozeCountdownText();

    if (snoozeSecondsLeft <= 0) {
      clearInterval(snoozeTimer);
      snoozeTimer = null;
      zeigeAlarmPopup(currentAlarmPerson);   // Alarm erneut anzeigen
    }
  }, 1000);

  // 4 ESP informieren
  btManager.sendData({ command: 'SNOOZE', mins });

}

// Stop drücken
function stopAlarm() {
  hideAlarmPopup();
  btManager.sendData({ command: "STOP" });

    if (snoozeTimer) { clearInterval(snoozeTimer); snoozeTimer = null; }
  currentAlarmPerson = null;

}

// --- Vibrationstest -------------------------------------------------
function startVibrationTest(person) {
  // Prüfen, ob Bluetooth aktiv
  if (!btManager || !btManager.characteristic) {
    return;
  }

  // Visuelles Feedback
  const btn = person === "Anna"
                ? document.getElementById("vibtest-anna")
                : document.getElementById("vibtest-markus");

  btn.classList.add("animate-pulse", "scale-105", "bg-blue-200");
setTimeout(() => btn.classList.remove("animate-pulse", "scale-105", "bg-blue-200"), 3000);


  // Befehl an ESP32 schicken
  btManager.sendData({ command: "TEST", person });
}


// ----------------------
// Init
// ----------------------
window.onload = () => {
  generateScrollLists();
  setupScrollListener(stundenScroll, "stunden");
  setupScrollListener(minutenScroll, "minuten");

  updateOverview();

  toggleAnna.addEventListener("change", () => {
    state.toggles.Anna = toggleAnna.checked;
    saveState();
    updateOverview();
    sendCurrentConfigToESP();
  });
  toggleMarkus.addEventListener("change", () => {
    state.toggles.Markus = toggleMarkus.checked;
    saveState();
    updateOverview();
    sendCurrentConfigToESP();
  });

  if (toggleAnnaPlan && toggleMarkusPlan) {
    toggleAnnaPlan.checked = state.schlafplanAktiv.Anna;
    toggleMarkusPlan.checked = state.schlafplanAktiv.Markus;

    toggleAnnaPlan.addEventListener("change", () => {
      state.schlafplanAktiv.Anna = toggleAnnaPlan.checked;
      saveState();
    });
    toggleMarkusPlan.addEventListener("change", () => {
      state.schlafplanAktiv.Markus = toggleMarkusPlan.checked;
      saveState();
    });
  }

  updateUebersichtTage();

  // Einstellungen Setup
  setupSliderLiveUpdate();
  renderBettseite();
  

  // alle 30 Sekunden neu berechnen (oder 60 000 ms, wenn dir 1 min genügt)
setInterval(updateNextAlarmText, 30 * 1000);

  // Buttons „Vibrationstest“
  const btnTestAnna   = document.getElementById("vibtest-anna");
  const btnTestMarkus = document.getElementById("vibtest-markus");

  if (btnTestAnna && btnTestMarkus) {
    btnTestAnna.addEventListener("click", () => startVibrationTest("Anna"));
    btnTestMarkus.addEventListener("click", () => startVibrationTest("Markus"));
  }

};

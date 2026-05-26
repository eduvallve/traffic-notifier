// ============================================================
// Traffic Notifier — Headless WhatsApp via CallMeBot
// ============================================================
// URL esperada:
//   index.html?route=latA,lonA;latB,lonB&phone=34600...,34611...&apikey=XXXXX&maxduration=30
//   També accepta lon,lat;lon,lat i normalitza automàticament.
//   maxduration és un valor en minuts per avisar de trànsit intens.
// ============================================================

// Referències DOM
const statusTitle = document.getElementById("status-title");
const statusDesc = document.getElementById("status-desc");
const spinner = document.getElementById("spinner");
const mainContent = document.getElementById("main-content");
const resultsList = document.getElementById("results-list");

// ----- Utilitats -----

/** Saneja un telèfon eliminant tot el que no sigui dígit */
function sanitize(phone) {
  return phone.replace(/\D/g, "");
}

/** Formata segons → text en català */
function formatDuration(seconds) {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 1) return "menys d'un minut";

  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (h === 0) return `${m} ${m === 1 ? "minut" : "minuts"}`;

  const hs = `${h} ${h === 1 ? "hora" : "hores"}`;
  if (m === 0) return hs;
  return `${hs} i ${m} ${m === 1 ? "minut" : "minuts"}`;
}

// ----- Lectura de paràmetres -----

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const route = p.get("route"); // "latA,lonA;latB,lonB"
  const phones = p.get("phone"); // "34600...,34611..."
  const apikey = p.get("apikey"); // "XXXXX"
  const maxduration = p.get("maxduration"); // "30"
  return { route, phones, apikey, maxduration };
}

function normalizePoint(point) {
  const parts = point.split(",").map((coord) => coord.trim());
  if (parts.length !== 2) {
    throw new Error(
      "Cada punt ha de contenir lat i lon separats per una coma.",
    );
  }

  const first = Number(parts[0]);
  const second = Number(parts[1]);
  if (Number.isNaN(first) || Number.isNaN(second)) {
    throw new Error("Les coordenades han de ser nombres vàlids.");
  }

  const firstIsLat = Math.abs(first) <= 90;
  const secondIsLat = Math.abs(second) <= 90;
  const firstIsLon = Math.abs(first) <= 180;
  const secondIsLon = Math.abs(second) <= 180;

  const possibleLatLon = firstIsLat && secondIsLon;
  const possibleLonLat = firstIsLon && secondIsLat;

  if (!possibleLatLon && !possibleLonLat) {
    throw new Error("Les coordenades han de ser lat/lon vàlids.");
  }

  const lat = possibleLatLon ? first : second;
  const lon = possibleLatLon ? second : first;

  return { lat, lon };
}

function parseRoute(route) {
  const parts = route.split(";").map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      "El paràmetre route ha de contenir dos punts separats per un punt i coma (;).",
    );
  }

  const start = normalizePoint(parts[0]);
  const end = normalizePoint(parts[1]);

  return {
    pointA: `${start.lon},${start.lat}`,
    pointB: `${end.lon},${end.lat}`,
  };
}

function parsePhones(phones) {
  return phones
    .split(",")
    .map((p) => sanitize(p.trim()))
    .filter((p) => p.length > 0);
}

function parseMaxDuration(value) {
  if (!value) {
    throw new Error(
      "El paràmetre maxduration és obligatori i ha de ser un nombre en minuts.",
    );
  }
  const minutes = parseInt(value, 10);
  if (Number.isNaN(minutes) || minutes <= 0) {
    throw new Error(
      "El paràmetre maxduration ha de ser un nombre positiu en minuts.",
    );
  }
  return minutes;
}

function extractShortAddress(data) {
  if (!data || !data.address) {
    return (
      data?.display_name?.split(",").slice(0, 2).join(", ") ||
      "Coordenades desconegudes"
    );
  }

  const address = data.address;
  const street =
    address.road ||
    address.pedestrian ||
    address.cycleway ||
    address.footway ||
    address.residential ||
    address.neighbourhood ||
    address.suburb;
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.county;

  if (street && city) {
    return `${street}, ${city}`;
  }
  if (city) {
    return city;
  }
  if (street) {
    return street;
  }
  return (
    data.display_name?.split(",").slice(0, 2).join(", ") ||
    "Coordenades desconegudes"
  );
}

async function reverseGeocode(point) {
  const [lon, lat] = point.split(",").map((coord) => coord.trim());
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&accept-language=ca`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const data = await res.json();
    return extractShortAddress(data);
  } catch (err) {
    console.warn("Reverse geocode failed for", point, err);
    return `${lat}, ${lon}`;
  }
}

function isRunningFromFileProtocol() {
  return window.location.protocol === "file:";
}

function sendWhatsappRequest(phone, message, apikey) {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${apikey}`;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(phone);
    img.onerror = () => resolve(phone);
    img.src = url;

    setTimeout(() => resolve(phone), 2000);
  });
}

// ----- UI helpers -----

function showError(title, desc) {
  mainContent.classList.add("error");
  statusTitle.textContent = title;
  statusDesc.innerHTML = desc;
  console.error(title, desc);
  spinner.remove();
}

function showDone(title, desc) {
  mainContent.classList.add("done");
  statusTitle.textContent = title;
  statusDesc.textContent = desc;
  console.log("Done:", title, desc);
  spinner.remove();
}

function addPhoneRow(phone) {
  const li = document.createElement("li");
  li.id = `row-${phone}`;
  li.innerHTML = `<span class="dot pending"></span>
    <span class="phone-num">+${phone}</span>
    <span class="phone-status">Enviant...</span>`;
  resultsList.appendChild(li);
}

function updatePhoneRow(phone, ok, text) {
  const li = document.getElementById(`row-${phone}`);
  if (!li) return;
  const dot = li.querySelector(".dot");
  const st = li.querySelector(".phone-status");
  dot.classList.remove("pending");
  dot.classList.add(ok ? "ok" : "fail");
  st.textContent = text;
}

// ----- Lògica principal -----

async function run() {
  // if (isRunningFromFileProtocol()) {
  //   showError('No es pot executar des de file://',
  //     'Prova la pàgina des de GitHub Pages o amb un servidor HTTP. El protocol local <code>file://</code> sovint bloqueja les peticions externes.');
  //   return;
  // }

  // 1. Llegir paràmetres
  const { route, phones, apikey, maxduration } = readParams();

  if (!route || !phones || !apikey || !maxduration) {
    showError("Falten paràmetres", "");
    statusDesc.innerHTML = `La URL ha de contenir <b>route</b>, <b>phone</b>, <b>apikey</b> i <b>maxduration</b>.<code>?route=latA,lonA;latB,lonB&amp;phone=34600000000&amp;apikey=EL_TEU_APIKEY&amp;maxduration=30</code>`;
    return;
  }

  let maxDurationMinutes;
  try {
    maxDurationMinutes = parseMaxDuration(maxduration);
  } catch (err) {
    showError("Maxduration invàlid", err.message);
    return;
  }

  const { pointA, pointB } = parseRoute(route);
  const phoneList = parsePhones(phones);

  if (phoneList.length === 0) {
    showError("Cap telèfon vàlid", "Revisa el paràmetre &phone= de la URL.");
    return;
  }

  // 2. Consultar OSRM
  statusTitle.textContent = "Consultant el trànsit...";
  statusDesc.textContent = `Ruta: ${pointA} → ${pointB}`;
  console.log("Consultant OSRM per a la ruta", pointA, "→", pointB);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let formattedTime;
  let durationMinutes;
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${pointA};${pointB}?overview=false`;
    const res = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length)
      throw new Error("No s'ha trobat cap ruta viable.");

    durationMinutes = Math.round(data.routes[0].duration / 60);
    formattedTime = formatDuration(data.routes[0].duration);
  } catch (err) {
    clearTimeout(timeout);
    const msg =
      err.name === "AbortError"
        ? "Timeout — l'API de trànsit no ha respost a temps."
        : err.message;
    showError("Error consultant el trànsit", msg);
    return;
  }

  statusTitle.textContent = "Consultant adreces...";
  statusDesc.textContent = "Obtenint les adreces de sortida i d'arribada...";
  console.log("Consultant Nominatim per a les adreces de", pointA, "i", pointB);

  const [startAddress, endAddress] = await Promise.all([
    reverseGeocode(pointA),
    reverseGeocode(pointB),
  ]);

  const isHeavyTraffic = durationMinutes > maxDurationMinutes;
  if (isHeavyTraffic) {
    const trafficNote = isHeavyTraffic
      ? `\n🚦 Transit intens: el trajecte supera els ${maxDurationMinutes} min.`
      : "";

    // 3. Preparar enviament
    const message = `🚗 ALERTA PEL TRAJECTE\nSortida: ${startAddress}\nArribada: ${endAddress}\nTemps estimat: ${formattedTime}.${trafficNote}`;
    statusTitle.textContent = "Enviant missatges de WhatsApp...";
    statusDesc.textContent = `Temps calculat: ${formattedTime}`;
    console.log("Missatge a enviar:", message);

    // Crear files per cada telèfon
    phoneList.forEach((ph) => addPhoneRow(ph));

    // 4. Enviar a tots els telèfons en paral·lel via CallMeBot

    const results = await Promise.allSettled(
      phoneList.map((phone) => sendWhatsappRequest(phone, message, apikey)),
    );

    // 5. Actualitzar resultats visuals
    let allOk = true;
    results.forEach((result, i) => {
      const phone = phoneList[i];
      if (result.status === "fulfilled") {
        updatePhoneRow(phone, true, "✓ Enviat");
      } else {
        allOk = false;
        updatePhoneRow(phone, false, "Error");
        console.error(`Error enviant a ${phone}:`, result.reason);
      }
    });

    // 6. Estat final
    if (allOk) {
      showDone(
        "Completat!",
        `S'han enviat ${phoneList.length} missatge(s) correctament.`,
      );
    } else {
      showError(
        "Alguns enviaments han fallat",
        "Consulta la consola per a més detalls.",
      );
    }
  } else {
    showDone(
      "Trànsit fluïd",
      `El temps estimat de ${formattedTime} no supera el límit de ${maxDurationMinutes} min.`,
    );
  }
}

// Executar immediatament
window.addEventListener("DOMContentLoaded", run);

// ============================================================
// Traffic Notifier — Headless WhatsApp via CallMeBot
// ============================================================
// URL esperada:
//   index.html?route=lonA,latA;lonB,latB&phone=34600...,34611...&apikey=XXXXX
// ============================================================

// Referències DOM
const statusTitle = document.getElementById('status-title');
const statusDesc  = document.getElementById('status-desc');
const spinner     = document.getElementById('spinner');
const mainContent = document.getElementById('main-content');
const resultsList = document.getElementById('results-list');

// ----- Utilitats -----

/** Saneja un telèfon eliminant tot el que no sigui dígit */
function sanitize(phone) {
  return phone.replace(/\D/g, '');
}

/** Formata segons → text en català */
function formatDuration(seconds) {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 1) return "menys d'un minut";

  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (h === 0) return `${m} ${m === 1 ? 'minut' : 'minuts'}`;

  const hs = `${h} ${h === 1 ? 'hora' : 'hores'}`;
  if (m === 0) return hs;
  return `${hs} i ${m} ${m === 1 ? 'minut' : 'minuts'}`;
}

// ----- Lectura de paràmetres -----

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const route  = p.get('route');   // "lonA,latA;lonB,latB"
  const phones = p.get('phone');   // "34600...,34611..."
  const apikey = p.get('apikey');   // "XXXXX"
  return { route, phones, apikey };
}

function parseRoute(route) {
  const parts = route.split(';').map(part => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('El paràmetre route ha de contenir dos punts separats per un punt i coma (;).');
  }

  const [pointA, pointB] = parts;
  const coordRegex = /^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/;
  if (!coordRegex.test(pointA) || !coordRegex.test(pointB)) {
    throw new Error('Cada punt ha de ser lon,lat amb nombres vàlids.');
  }

  return { pointA, pointB };
}

function parsePhones(phones) {
  return phones.split(',').map(p => sanitize(p.trim())).filter(p => p.length > 0);
}

async function reverseGeocode(point) {
  const [lon, lat] = point.split(',').map(coord => coord.trim());
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&accept-language=ca`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const data = await res.json();
    return data.display_name || `${lat}, ${lon}`;
  } catch (err) {
    console.warn('Reverse geocode failed for', point, err);
    return `${lat}, ${lon}`;
  }
}

function isRunningFromFileProtocol() {
  return window.location.protocol === 'file:';
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
  mainContent.classList.add('error');
  statusTitle.textContent = title;
  statusDesc.innerHTML = desc;
}

function showDone(title, desc) {
  mainContent.classList.add('done');
  statusTitle.textContent = title;
  statusDesc.textContent = desc;
}

function addPhoneRow(phone) {
  const li = document.createElement('li');
  li.id = `row-${phone}`;
  li.innerHTML = `<span class="dot pending"></span>
    <span class="phone-num">+${phone}</span>
    <span class="phone-status">Enviant...</span>`;
  resultsList.appendChild(li);
}

function updatePhoneRow(phone, ok, text) {
  const li = document.getElementById(`row-${phone}`);
  if (!li) return;
  const dot = li.querySelector('.dot');
  const st  = li.querySelector('.phone-status');
  dot.classList.remove('pending');
  dot.classList.add(ok ? 'ok' : 'fail');
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
  const { route, phones, apikey } = readParams();

  if (!route || !phones || !apikey) {
    showError('Falten paràmetres', '');
    statusDesc.innerHTML =
      `La URL ha de contenir <b>route</b>, <b>phone</b> i <b>apikey</b>.<code>?route=lonA,latA;lonB,latB&amp;phone=34600000000&amp;apikey=EL_TEU_APIKEY</code>`;
    return;
  }

  const { pointA, pointB } = parseRoute(route);
  const phoneList = parsePhones(phones);

  if (phoneList.length === 0) {
    showError('Cap telèfon vàlid', 'Revisa el paràmetre &phone= de la URL.');
    return;
  }

  // 2. Consultar OSRM
  statusTitle.textContent = 'Consultant el trànsit...';
  statusDesc.textContent  = `Ruta: ${pointA} → ${pointB}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let formattedTime;
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${pointA};${pointB}?overview=false`;
    const res  = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length)
      throw new Error('No s\'ha trobat cap ruta viable.');

    formattedTime = formatDuration(data.routes[0].duration);
  } catch (err) {
    clearTimeout(timeout);
    const msg = err.name === 'AbortError'
      ? 'Timeout — l\'API de trànsit no ha respost a temps.'
      : err.message;
    showError('Error consultant el trànsit', msg);
    return;
  }

  statusTitle.textContent = 'Consultant adreces...';
  statusDesc.textContent = 'Obtenint les adreces de sortida i d\'arribada...';

  const [startAddress, endAddress] = await Promise.all([
    reverseGeocode(pointA),
    reverseGeocode(pointB)
  ]);

  // 3. Preparar enviament
  const message = `🚗 El temps estimat per al teu trajecte des de ${startAddress} fins a ${endAddress} és de ${formattedTime}.`;
  statusTitle.textContent = 'Enviant missatges de WhatsApp...';
  statusDesc.textContent  = `Temps calculat: ${formattedTime}`;

  // Crear files per cada telèfon
  phoneList.forEach(ph => addPhoneRow(ph));

  // 4. Enviar a tots els telèfons en paral·lel via CallMeBot
  const results = await Promise.allSettled(
    phoneList.map((phone) => sendWhatsappRequest(phone, message, apikey))
  );

  // 5. Actualitzar resultats visuals
  let allOk = true;
  results.forEach((result, i) => {
    const phone = phoneList[i];
    if (result.status === 'fulfilled') {
      updatePhoneRow(phone, true, '✓ Enviat');
    } else {
      allOk = false;
      updatePhoneRow(phone, false, 'Error');
      console.error(`Error enviant a ${phone}:`, result.reason);
    }
  });

  // 6. Estat final
  if (allOk) {
    showDone('Completat!', `S'han enviat ${phoneList.length} missatge(s) correctament.`);
  } else {
    showError('Alguns enviaments han fallat', 'Consulta la consola per a més detalls.');
  }
}

// Executar immediatament
window.addEventListener('DOMContentLoaded', run);

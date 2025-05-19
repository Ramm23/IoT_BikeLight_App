import * as L from 'https://esm.sh/leaflet@1.9.4';

// Your 16‑hex‑digit device EUI for subscription
const DEVICE_EUI = '0004A30B010D3F45';

let map: L.Map;
let marker: L.Marker;
let circle: L.Circle;

// Track current mode: false = standard, true = stolen
let isStolenMode = false;

// --- Cookie helper functions ---
function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}
function getCookie(name: string): string {
  return document.cookie
    .split('; ')
    .reduce((r, v) => {
      const [key, val] = v.split('=');
      return key === name ? decodeURIComponent(val) : r;
    }, '');
}

// Update UI elements based on current mode, including button color
function updateModeUI() {
  const mapEl = document.getElementById('map') as HTMLElement;
  const btn = document.getElementById('sendDownlink') as HTMLButtonElement;
  if (!mapEl || !btn) return;

  if (isStolenMode) {
    mapEl.style.display = 'block';
    btn.textContent = 'Stop Tracking';
    // Recalculate Leaflet map size when visible
    requestAnimationFrame(() => map.invalidateSize());
  } else {
    mapEl.style.display = 'none';
    btn.textContent = 'Report Stolen';
    // Reset map view to default
  }

  // Toggle CSS classes for button color
  btn.classList.toggle('stolen', isStolenMode);
  btn.classList.toggle('standard', !isStolenMode);
}

// Initialize the Leaflet map (hidden by default)
function setupMap() {
  map = L.map('map').setView([51.505, -0.09], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  marker = L.marker([51.5, -0.09]).addTo(map)
    .bindPopup('Current Location.')
    .openPopup();
  circle = L.circle([51.5, -0.09], { radius: 200 }).addTo(map);

  document.getElementById('map')!.style.display = 'none';
}

/**
 * Parse incoming 13-byte payload:
 * [0–3] int32 lat (×1e–7), [4–7] int32 lng (×1e–7),
 * [8–11] uint32 accuracy (÷1e3), [12] battery %
 */
function parsePayload(bytes: number[]): { lat: number; lng: number; acc: number; battery: number } {
  const view = new DataView(new ArrayBuffer(bytes.length));
  bytes.forEach((b, i) => view.setUint8(i, b));
  return {
    lat: view.getInt32(0, true) / 1e7,
    lng: view.getInt32(4, true) / 1e7,
    acc: view.getUint32(8, true) / 1e3,
    battery: view.getUint8(12),
  };
}

/**
 * Maps a percentage (0–100) into one of 4 buckets:
 *   0% -> 0, 1–25% -> 1, 26–50% -> 2, 51–100% -> 3
 * and returns its two-bit binary string (00, 01, 10, 11).
 */
function decodeBatteryByte(byte: number): { percent: number; suffix: string } {
  const idx = Math.min(3, byte & 0b11);
  const percentMap = [0, 25, 50, 100];
  const percent = percentMap[idx];
  const suffix = idx.toString(2).padStart(2, '0');
  return { percent, suffix };
}
/**
 * Updates the <img> with id="battery-icon" to the appropriate
 * battery image based on the current percentage.
 */
export function updateBatteryIcon(percent: number): void {
  const { percent: pct } = decodeBatteryByte(percent);
  const img = document.getElementById('battery-icon') as HTMLImageElement;
  if (!img) {
    console.warn('Battery icon element not found');
    return;
  }
  // pct will be one of [0,25,50,100]
  const fileName = `battery_${pct}%.png`; // e.g. "battery_25%.png"
  img.src = `/images/${fileName}`;
}

// Render an incoming frame, with guardrails per mode
function renderFrame(frame: any) {
  const hex = frame.data as string;
  const raw = Array.from({ length: hex.length / 2 }, (_, i) =>
    parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  );
  const el = document.getElementById('sensor-data');
  if (!el) return;

  if (isStolenMode) {
    if (raw.length !== 13) return;
    const { lat, lng, acc, battery } = parsePayload(raw);
    updateBatteryIcon(battery);
    el.innerHTML = `<p>Latitude: ${lat.toFixed(6)}</p><p>Longitude: ${lng.toFixed(6)}</p>`;
    marker.setLatLng([lat, lng]);
    circle.setLatLng([lat, lng]).setRadius(acc);
    map.panTo([lat, lng]);
  } else {
    if (raw.length !== 1) return;
    // decode 0–3 byte into percent and suffix
    const { percent } = decodeBatteryByte(raw[0]);
    updateBatteryIcon(percent);
    
    el.innerHTML = `<p>Battery: ${percent}%</p>`;
  }
}


// Toggle-mode button: flip state, persist cookie, send 1-byte downlink
function setupDownlinkButton() {
  const btn = document.getElementById('sendDownlink') as HTMLButtonElement | null;
  if (!btn) return;
  btn.addEventListener('click', () => {
    isStolenMode = !isStolenMode;
    setCookie('mode', isStolenMode ? '1' : '0', 7);
    updateModeUI();
    const hex = isStolenMode ? '01' : '00';
    socket.send(JSON.stringify({ cmd: 'tx', EUI: DEVICE_EUI, data: hex, port: 2, confirmed: false, priority: 0 }));
  });
}

// WebSocket setup: request cache & subscribe, then handle updates
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${proto}//${location.host}/ws`);

socket.onopen = () => {
  socket.send(JSON.stringify({ cmd: 'cq', page: 1 }));
  socket.send(JSON.stringify({ cmd: 'sub', EUI: DEVICE_EUI }));
};

socket.onmessage = (evt) => {
  const msg = JSON.parse(evt.data);

  if (msg.cmd === 'cq') {
    const cache = (msg.cache as any[])
      .filter(i =>
        i.EUI === DEVICE_EUI &&
        (i.cmd === 'rx' || i.cmd === 'gw')
      );
    if (cache.length) {
      const first = cache[0];
      const bytes = Array.from({ length: (first.data as string).length / 2 }, (_, i) =>
        parseInt((first.data as string).slice(i * 2, i * 2 + 2), 16)
      );
      const detectedStolen = bytes.length === 13;
      if (detectedStolen !== isStolenMode) {
        isStolenMode = detectedStolen;
        setCookie('mode', isStolenMode ? '1' : '0', 7);
        updateModeUI();
      }
      renderFrame(first);
    }
  } else if ((msg.cmd === 'gw' || msg.cmd === 'rx') && msg.EUI === DEVICE_EUI) {
    renderFrame(msg);
  }
};

socket.onerror = (e) => console.error('WS error', e);
socket.onclose = () => console.log('WS closed');

// Initial setup

document.addEventListener('DOMContentLoaded', () => {
  setupMap();
  isStolenMode = getCookie('mode') === '1';
  setupDownlinkButton();
  updateModeUI();
});

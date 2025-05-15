// app.ts

import * as L from 'https://esm.sh/leaflet@1.9.4';

// Your 16-hex-digit device EUI for subscription
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

// Update UI elements based on current mode
function updateModeUI() {
  const mapEl = document.getElementById('map') as HTMLElement;
  const btn   = document.getElementById('sendDownlink') as HTMLButtonElement;
  if (!mapEl || !btn) return;

  if (isStolenMode) {
    mapEl.style.display = 'block';
    btn.textContent     = 'Switch to Standard Mode';
    // Fix: ensure tiles load correctly after container is shown
    setTimeout(() => map.invalidateSize(), 0);
  } else {
    mapEl.style.display = 'none';
    btn.textContent     = 'Switch to Stolen Mode';
  }
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

  // Hide map initially if in standard mode
  const mapEl = document.getElementById('map') as HTMLElement;
  if (mapEl) mapEl.style.display = 'none';
}

/**
 * Parse incoming 13-byte payload:
 * [0–3] int32 lat (×1e–7), [4–7] int32 lng (×1e–7),
 * [8–11] uint32 accuracy (÷1e3), [12] battery %
 */
function parsePayload(bytes: number[]): {
  lat: number; lng: number; acc: number; battery: number;
} {
  const view = new DataView(new ArrayBuffer(bytes.length));
  bytes.forEach((b, i) => view.setUint8(i, b));
  return {
    lat:     view.getInt32(0, true) / 1e7,
    lng:     view.getInt32(4, true) / 1e7,
    acc:     view.getUint32(8, true) / 1e3,
    battery: view.getUint8(12),
  };
}

// Render an incoming frame, with guardrails per mode
function renderFrame(frame: any) {
  const outerHex = frame.data as string;
  const raw: number[] = [];
  for (let i = 0; i < outerHex.length; i += 2) {
    raw.push(parseInt(outerHex.slice(i, i + 2), 16));
  }

  const el = document.getElementById('sensor-data');
  if (!el) return;

  if (isStolenMode) {
    // Expect full 13-byte payload
    if (raw.length !== 13) {
      console.error(`Stolen mode expects 13 bytes, got ${raw.length}`);
      return;
    }
    const { lat, lng, acc } = parsePayload(raw);
    marker.setLatLng([lat, lng]);
    circle.setLatLng([lat, lng]).setRadius(acc);
    map.panTo([lat, lng]);
    el.innerHTML = `
      <p>Latitude: ${lat.toFixed(6)}</p>
      <p>Longitude: ${lng.toFixed(6)}</p>
    `;
  } else {
    // Standard mode: expect only battery byte
    if (raw.length !== 1) {
      console.error(`Standard mode expects 1 byte, got ${raw.length}`);
      return;
    }
    const battery = raw[0];
    el.innerHTML = `<p>Battery: ${battery}%</p>`;
  }
}

// WebSocket setup: request cache & subscribe, then handle updates
const proto  = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${proto}//${location.host}/ws`);
socket.onopen = () => {
  // Fetch history cache
  socket.send(JSON.stringify({ cmd: 'cq', page: 1 }));
  // Then subscribe for live updates
  socket.send(JSON.stringify({ cmd: 'sub', EUI: DEVICE_EUI }));
};
socket.onmessage = evt => {
  const msg = JSON.parse(evt.data);

  if (msg.cmd === 'cq') {
    const cache = (msg.cache as any[]).filter(i => i.EUI === DEVICE_EUI);
    if (cache.length) {
      const last = cache[cache.length - 1];
      // Detect mode based on payload size
      const hex = last.data as string;
      const rawBytes: number[] = [];
      for (let i = 0; i < hex.length; i += 2) {
        rawBytes.push(parseInt(hex.slice(i, i + 2), 16));
      }
      const detectedStolen = rawBytes.length === 13;
      if (detectedStolen !== isStolenMode) {
        isStolenMode = detectedStolen;
        setCookie('mode', isStolenMode ? '1' : '0', 7);
        updateModeUI();
      }
      renderFrame(last);
    }
  } else if ((msg.cmd === 'gw' || msg.cmd === 'rx') && msg.EUI === DEVICE_EUI) {
    renderFrame(msg);
  }
};
socket.onerror = e => console.error('WS error', e);
socket.onclose = () => console.log('WS closed');

// Toggle-mode button: flip state, persist cookie, send 1-byte downlink
function setupDownlinkButton() {
  const btn = document.getElementById('sendDownlink');
  if (!btn) return;

  btn.addEventListener('click', () => {
    isStolenMode = !isStolenMode;
    setCookie('mode', isStolenMode ? '1' : '0', 7);
    updateModeUI();

    const hex = isStolenMode ? '01' : '00';
    socket.send(JSON.stringify({
      cmd:       'tx',
      EUI:       DEVICE_EUI,
      data:      hex,
      port:      2,
      confirmed: false,
      priority:  0
    }));
  });
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupMap();
  // Restore mode from cookie
  isStolenMode = getCookie('mode') === '1';
  updateModeUI();
  setupDownlinkButton();
});

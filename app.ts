// app.ts

import * as L from 'https://esm.sh/leaflet@1.9.4';

// Your 16‑hex‑digit device EUI for subscription
const DEVICE_EUI = '0004A30B010D3F45';

let map: L.Map;
let marker: L.Marker;
let circle: L.Circle;

/**
 * Initialize the Leaflet map using the OSM example snippet
 */
function setupMap() {
  // Center map at example coords with zoom 13
  map = L.map('map').setView([51.505, -0.09], 13);

  // OSM tile layer
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Example marker + popup
  marker = L.marker([51.5, -0.09]).addTo(map)
    .bindPopup('Current Location.')
    .openPopup();
  
  circle = L.circle([51.5, -0.09], {radius: 200}).addTo(map)
}

/**
 * Parse incoming 12-byte payload:
 * [0–3] float32 lat, [4–7] float32 lng, [8–11] uint32 battery (little-endian)
 */
function parsePayload(bytes: number[]): { lat: number; lng: number; acc: number; battery: number } {
  const view = new DataView(new ArrayBuffer(13));
  bytes.forEach((b, i) => view.setUint8(i, b));
  return {
    lat: view.getInt32(0, true)/10000000,
    lng: view.getInt32(4, true)/10000000,
    acc: view.getUint32(8, true)/1000,
    battery: view.getUint8(12)
  };
}

/**
 * Update the marker position and map view
 */
function renderFrame(frame: any) {
  // 1) Grab the 48-char hex from Loriot
  const outerHex = frame.data as string;

  // 2) Decode it to an array of ASCII char codes
  /*
  const asciiCodes: number[] = [];
  for (let i = 0; i < outerHex.length; i += 2) {
    asciiCodes.push(parseInt(outerHex.slice(i, i + 2), 16));
  }
  const asciiHex = String.fromCharCode(...asciiCodes);  // e.g. "54B45E42C21749…"
  */
  // 3) Now decode that ASCII-hex into your 12 bytes
  const raw: number[] = [];
  for (let i = 0; i < outerHex.length; i += 2) {
    raw.push(parseInt(outerHex.slice(i, i + 2), 16));
  }
  console.log(raw)

  if (raw.length !== 13) {
    console.error(`Expected 13 bytes but got ${raw.length}`);
    return;
  }

  // 4) Parse out lat, lng, battery
  const { lat, lng, battery, acc } = parsePayload(raw);

  // 5) Update your marker, map, and UI
  marker.setLatLng([lat, lng]);
  circle.setLatLng([lat,lng]);
  circle.setRadius(acc);
  map.panTo([lat, lng]);
  const el = document.getElementById("sensor-data");
  if (el) {
    el.innerHTML = `
      <p>Latitude: ${lat.toFixed(6)}</p>
      <p>Longitude: ${lng.toFixed(6)}</p>
      <p> Accuracy:${acc.toFixed(6)}</p>
      <p>Battery: ${battery}</p>
    `;
  }
}

/**
 * Simple downlink encoder (setCounter & range)
 */
type DownlinkOk = { fPort: number; bytes: number[]; warnings: string[] };
type DownlinkErr = { errors: string[] };
function encodeDownlink(input: { setCounter: boolean; range: number }): DownlinkOk | DownlinkErr {
  const { setCounter, range } = input;
  if (typeof range !== 'number') return { errors: ['Invalid range'] };
  return { fPort: 10, bytes: [setCounter ? 1 : 0, range & 0xff], warnings: [] };
}

// Open WebSocket to Loriot proxy
declare const location: any;
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${proto}//${location.host}/ws`);

socket.onopen = () => {
  socket.send(JSON.stringify({ cmd: 'cq', page: 1 }));
  socket.send(JSON.stringify({ cmd: 'sub', EUI: DEVICE_EUI }));
};

socket.onmessage = evt => {
  const msg = JSON.parse(evt.data);
  if (msg.cmd === 'cq') {
    msg.cache.filter((i: any) => i.EUI === DEVICE_EUI).forEach(renderFrame);
  } else if ((msg.cmd === 'gw' || msg.cmd === 'rx') && msg.EUI === DEVICE_EUI) {
    renderFrame(msg);
  }
};

socket.onerror = e => console.error('WS error', e);
socket.onclose = () => console.log('WS closed');

/**
 * Hook up the downlink button
 */
function setupDownlinkButton() {
  const btn = document.getElementById('sendDownlink');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const res = encodeDownlink({ setCounter: true, range: 1 });
    if ('errors' in res) return console.error(res.errors);
    const hex = res.bytes.map(b => b.toString(16).padStart(2, '1')).join('');
    socket.send(JSON.stringify({ cmd: 'tx', EUI: DEVICE_EUI, data: hex, port: 2, confirmed: false, priority: 0 }));
  });
}

// Initialize map & button once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupMap();
  setupDownlinkButton();
});

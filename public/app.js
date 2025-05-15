// app.ts
import * as L from "https://esm.sh/leaflet@1.9.4";
var DEVICE_EUI = "0004A30B010D3F45";
var map2;
var marker2;
var circle2;
var isStolenMode = false;
function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}
function getCookie(name) {
  return document.cookie.split("; ").reduce((r, v) => {
    const [key, val] = v.split("=");
    return key === name ? decodeURIComponent(val) : r;
  }, "");
}
function updateModeUI() {
  const mapEl = document.getElementById("map");
  const btn = document.getElementById("sendDownlink");
  if (!mapEl || !btn)
    return;
  if (isStolenMode) {
    mapEl.style.display = "block";
    btn.textContent = "Switch to Standard Mode";
    setTimeout(() => map2.invalidateSize(), 0);
  } else {
    mapEl.style.display = "none";
    btn.textContent = "Switch to Stolen Mode";
  }
}
function setupMap() {
  map2 = L.map("map").setView([51.505, -0.09], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map2);
  marker2 = L.marker([51.5, -0.09]).addTo(map2).bindPopup("Current Location.").openPopup();
  circle2 = L.circle([51.5, -0.09], { radius: 200 }).addTo(map2);
  const mapEl = document.getElementById("map");
  if (mapEl)
    mapEl.style.display = "none";
}
function parsePayload(bytes) {
  const view = new DataView(new ArrayBuffer(bytes.length));
  bytes.forEach((b, i) => view.setUint8(i, b));
  return {
    lat: view.getInt32(0, true) / 1e7,
    lng: view.getInt32(4, true) / 1e7,
    acc: view.getUint32(8, true) / 1e3,
    battery: view.getUint8(12)
  };
}
function renderFrame(frame) {
  const outerHex = frame.data;
  const raw = [];
  for (let i = 0; i < outerHex.length; i += 2) {
    raw.push(parseInt(outerHex.slice(i, i + 2), 16));
  }
  const el = document.getElementById("sensor-data");
  if (!el)
    return;
  if (isStolenMode) {
    if (raw.length !== 13) {
      console.error(`Stolen mode expects 13 bytes, got ${raw.length}`);
      return;
    }
    const { lat, lng, acc } = parsePayload(raw);
    marker2.setLatLng([lat, lng]);
    circle2.setLatLng([lat, lng]).setRadius(acc);
    map2.panTo([lat, lng]);
    el.innerHTML = `
      <p>Latitude: ${lat.toFixed(6)}</p>
      <p>Longitude: ${lng.toFixed(6)}</p>
    `;
  } else {
    if (raw.length !== 1) {
      console.error(`Standard mode expects 1 byte, got ${raw.length}`);
      return;
    }
    const battery = raw[0];
    el.innerHTML = `<p>Battery: ${battery}%</p>`;
  }
}
var proto = location.protocol === "https:" ? "wss:" : "ws:";
var socket = new WebSocket(`${proto}//${location.host}/ws`);
socket.onopen = () => {
  socket.send(JSON.stringify({ cmd: "cq", page: 1 }));
  socket.send(JSON.stringify({ cmd: "sub", EUI: DEVICE_EUI }));
};
socket.onmessage = (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg.cmd === "cq") {
    const cache = msg.cache.filter((i) => i.EUI === DEVICE_EUI);
    if (cache.length) {
      const last = cache[cache.length - 1];
      const hex = last.data;
      const rawBytes = [];
      for (let i = 0; i < hex.length; i += 2) {
        rawBytes.push(parseInt(hex.slice(i, i + 2), 16));
      }
      const detectedStolen = rawBytes.length === 13;
      if (detectedStolen !== isStolenMode) {
        isStolenMode = detectedStolen;
        setCookie("mode", isStolenMode ? "1" : "0", 7);
        updateModeUI();
      }
      renderFrame(last);
    }
  } else if ((msg.cmd === "gw" || msg.cmd === "rx") && msg.EUI === DEVICE_EUI) {
    renderFrame(msg);
  }
};
socket.onerror = (e) => console.error("WS error", e);
socket.onclose = () => console.log("WS closed");
function setupDownlinkButton() {
  const btn = document.getElementById("sendDownlink");
  if (!btn)
    return;
  btn.addEventListener("click", () => {
    isStolenMode = !isStolenMode;
    setCookie("mode", isStolenMode ? "1" : "0", 7);
    updateModeUI();
    const hex = isStolenMode ? "01" : "00";
    socket.send(JSON.stringify({
      cmd: "tx",
      EUI: DEVICE_EUI,
      data: hex,
      port: 2,
      confirmed: false,
      priority: 0
    }));
  });
}
document.addEventListener("DOMContentLoaded", () => {
  setupMap();
  isStolenMode = getCookie("mode") === "1";
  updateModeUI();
  setupDownlinkButton();
});
//# sourceMappingURL=app.js.map

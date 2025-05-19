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
    btn.textContent = "Stop Tracking";
    requestAnimationFrame(() => map2.invalidateSize());
  } else {
    mapEl.style.display = "none";
    btn.textContent = "Report Stolen";
  }
  btn.classList.toggle("stolen", isStolenMode);
  btn.classList.toggle("standard", !isStolenMode);
}
function setupMap() {
  map2 = L.map("map").setView([51.505, -0.09], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map2);
  marker2 = L.marker([51.5, -0.09]).addTo(map2).bindPopup("Current Location.").openPopup();
  circle2 = L.circle([51.5, -0.09], { radius: 200 }).addTo(map2);
  document.getElementById("map").style.display = "none";
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
function decodeBatteryByte(byte) {
  const idx = Math.min(3, byte & 3);
  const percentMap = [0, 25, 50, 100];
  const percent = percentMap[idx];
  const suffix = idx.toString(2).padStart(2, "0");
  return { percent, suffix };
}
function updateBatteryIcon(percent) {
  const { percent: pct } = decodeBatteryByte(percent);
  const img = document.getElementById("battery-icon");
  if (!img) {
    console.warn("Battery icon element not found");
    return;
  }
  const fileName = `battery_${pct}%.png`;
  img.src = `/images/${fileName}`;
}
function renderFrame(frame) {
  const hex = frame.data;
  const raw = Array.from(
    { length: hex.length / 2 },
    (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  );
  const el = document.getElementById("sensor-data");
  if (!el)
    return;
  if (isStolenMode) {
    if (raw.length !== 13)
      return;
    const { lat, lng, acc, battery } = parsePayload(raw);
    updateBatteryIcon(battery);
    el.innerHTML = `<p>Latitude: ${lat.toFixed(6)}</p><p>Longitude: ${lng.toFixed(6)}</p>`;
    marker2.setLatLng([lat, lng]);
    circle2.setLatLng([lat, lng]).setRadius(acc);
    map2.panTo([lat, lng]);
  } else {
    if (raw.length !== 1)
      return;
    const { percent } = decodeBatteryByte(raw[0]);
    updateBatteryIcon(percent);
    el.innerHTML = `<p>Battery: ${percent}%</p>`;
  }
}
function setupDownlinkButton() {
  const btn = document.getElementById("sendDownlink");
  if (!btn)
    return;
  btn.addEventListener("click", () => {
    isStolenMode = !isStolenMode;
    setCookie("mode", isStolenMode ? "1" : "0", 7);
    updateModeUI();
    const hex = isStolenMode ? "01" : "00";
    socket.send(JSON.stringify({ cmd: "tx", EUI: DEVICE_EUI, data: hex, port: 2, confirmed: false, priority: 0 }));
  });
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
    const cache = msg.cache.filter(
      (i) => i.EUI === DEVICE_EUI && (i.cmd === "rx" || i.cmd === "gw")
    );
    if (cache.length) {
      const first = cache[0];
      const bytes = Array.from(
        { length: first.data.length / 2 },
        (_, i) => parseInt(first.data.slice(i * 2, i * 2 + 2), 16)
      );
      const detectedStolen = bytes.length === 13;
      if (detectedStolen !== isStolenMode) {
        isStolenMode = detectedStolen;
        setCookie("mode", isStolenMode ? "1" : "0", 7);
        updateModeUI();
      }
      renderFrame(first);
    }
  } else if ((msg.cmd === "gw" || msg.cmd === "rx") && msg.EUI === DEVICE_EUI) {
    renderFrame(msg);
  }
};
socket.onerror = (e) => console.error("WS error", e);
socket.onclose = () => console.log("WS closed");
document.addEventListener("DOMContentLoaded", () => {
  setupMap();
  isStolenMode = getCookie("mode") === "1";
  setupDownlinkButton();
  updateModeUI();
});
export {
  updateBatteryIcon
};
//# sourceMappingURL=app.js.map

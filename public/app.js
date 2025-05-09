// app.ts
import * as L from "https://esm.sh/leaflet@1.9.4";
var DEVICE_EUI = "0004A30B010D3F45";
var map2;
var marker2;
var circle2;
function setupMap() {
  map2 = L.map("map").setView([51.505, -0.09], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map2);
  marker2 = L.marker([51.5, -0.09]).addTo(map2).bindPopup("Current Location.").openPopup();
  circle2 = L.circle([51.5, -0.09], { radius: 200 }).addTo(map2);
}
function parsePayload(bytes) {
  const view = new DataView(new ArrayBuffer(13));
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
  console.log(raw);
  if (raw.length !== 13) {
    console.error(`Expected 13 bytes but got ${raw.length}`);
    return;
  }
  const { lat, lng, battery, acc } = parsePayload(raw);
  marker2.setLatLng([lat, lng]);
  circle2.setLatLng([lat, lng]);
  circle2.setRadius(acc);
  map2.panTo([lat, lng]);
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
function encodeDownlink(input) {
  const { setCounter, range } = input;
  if (typeof range !== "number")
    return { errors: ["Invalid range"] };
  return { fPort: 10, bytes: [setCounter ? 1 : 0, range & 255], warnings: [] };
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
    msg.cache.filter((i) => i.EUI === DEVICE_EUI).forEach(renderFrame);
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
    const res = encodeDownlink({ setCounter: true, range: 1 });
    if ("errors" in res)
      return console.error(res.errors);
    const hex = res.bytes.map((b) => b.toString(16).padStart(2, "1")).join("");
    socket.send(JSON.stringify({ cmd: "tx", EUI: DEVICE_EUI, data: hex, port: 2, confirmed: false, priority: 0 }));
  });
}
document.addEventListener("DOMContentLoaded", () => {
  setupMap();
  setupDownlinkButton();
});
//# sourceMappingURL=app.js.map

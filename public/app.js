(() => {
  // app.ts
  var DEVICE_EUI = "0004A30B010624BC";
  var proto = location.protocol === "https:" ? "wss:" : "ws:";
  var socket = new WebSocket(`${proto}//${location.host}/ws`);
  function decodeUplink(input) {
    const maybeAscii = String.fromCharCode(...input.bytes);
    if (/^[0-9A-Fa-f]+$/.test(maybeAscii)) {
      return { data: { light: parseInt(maybeAscii, 16) }, warnings: [] };
    }
    if (input.bytes.length < 2) {
      return { errors: ["Not enough data to decode"] };
    }
    const lightRaw = input.bytes[0] << 8 | input.bytes[1];
    return { data: { light: lightRaw }, warnings: [] };
  }
  function encodeDownlink(input) {
    try {
      const { setCounter, range } = input.data;
      if (typeof range !== "number") {
        return { errors: ["Missing or invalid 'range' in downlink data"] };
      }
      const byte0 = setCounter ? 1 : 0;
      const byte1 = range & 255;
      return { fPort: 10, bytes: [byte0, byte1], warnings: [] };
    } catch (err) {
      return { errors: ["Failed to encode downlink: " + err.message] };
    }
  }
  socket.onopen = () => {
    console.log("\u2705 Connected to proxy WebSocket");
    socket.send(JSON.stringify({ cmd: "cq", page: 1 }));
    socket.send(JSON.stringify({ cmd: "sub", EUI: DEVICE_EUI }));
  };
  socket.onerror = (err) => {
    console.error("\u26A0\uFE0F WebSocket error", err);
  };
  socket.onclose = () => {
    console.log("\u{1F6D1} WebSocket closed");
  };
  socket.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.cmd === "cq") {
      console.log("history:", msg.cache);
      msg.cache.filter((item) => item.EUI === DEVICE_EUI).forEach(renderFrame);
      return;
    }
    if ((msg.cmd === "gw" || msg.cmd === "rx") && msg.EUI === DEVICE_EUI) {
      renderFrame(msg);
    }
    if ((msg.cmd === "tx" || msg.cmd === "mtx") && msg.EUI === DEVICE_EUI) {
      console.log("downlink enqueued:", msg);
    }
  };
  function renderFrame(frame) {
    const hex = frame.data;
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    const uplink = {
      bytes,
      fPort: frame.port,
      recvTime: new Date(frame.ts).toISOString()
    };
    const decoded = decodeUplink(uplink);
    if (decoded.errors?.length) {
      console.error("decodeUplink error", decoded.errors);
      return;
    }
    const container = document.getElementById("sensor-data");
    if (!container)
      return;
    container.innerHTML = decoded.data.light != null ? `<p>Light sensor: ${decoded.data.light}</p>` : `<p>Raw data: ${JSON.stringify(decoded.data)}</p>`;
  }
  function setupDownlinkButton() {
    const btn = document.getElementById("sendDownlink");
    if (!btn)
      return console.error("Send button not found");
    btn.addEventListener("click", () => {
      const result = encodeDownlink({ data: { setCounter: true, range: 1 } });
      if ("errors" in result) {
        console.error("Encode errors:", result.errors);
        return;
      }
      const { fPort, bytes } = result;
      const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
      const downMsg = {
        cmd: "tx",
        EUI: DEVICE_EUI,
        port: fPort,
        data: hex,
        confirmed: false
        // optional
      };
      socket.send(JSON.stringify(downMsg));
      console.log("\u2B07\uFE0F Sent downlink message:", downMsg);
    });
  }
  document.addEventListener("DOMContentLoaded", setupDownlinkButton);
})();
//# sourceMappingURL=app.js.map

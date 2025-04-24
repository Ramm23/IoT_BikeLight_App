(() => {
  // app.ts
  var DEVICE_EUI = "00004A30B010D3F45";
  function decodeUplink(input) {
    if (!input.bytes || input.bytes.length < 2) {
      return { errors: ["Not enough data to decode light sensor value"] };
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
  var socket = new WebSocket(`ws://${globalThis.location.host}/ws`);
  socket.onopen = () => {
    console.log("\u2705 Connected to proxy WebSocket");
  };
  socket.onerror = (err) => {
    console.error("\u26A0\uFE0F WebSocket error", err);
  };
  socket.onclose = () => {
    console.log("\u{1F6D1} WebSocket closed");
  };
  socket.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.cmd === "rx" && msg.EUI === DEVICE_EUI) {
      const recvTime = new Date(msg.ts).toISOString();
      let dataObj;
      if (msg.decoded && msg.decoded.data) {
        dataObj = msg.decoded.data;
      } else {
        const hex = msg.data;
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
          bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        const uplink = {
          bytes,
          fPort: msg.port,
          // e.g. 1 or whatever port
          recvTime
        };
        const decoded = decodeUplink(uplink);
        if (decoded.errors && decoded.errors.length) {
          console.error("Decoding errors:", decoded.errors);
          return;
        }
        dataObj = decoded.data;
      }
      if (typeof dataObj.light === "number") {
        const container = document.getElementById("sensor-data");
        if (container) {
          container.innerHTML = `<p>Light Sensor Value: ${dataObj.light}</p>`;
        }
      }
      if (typeof dataObj.temperature === "number") {
        const container = document.getElementById("sensor-data");
        if (container) {
          container.innerHTML = `
          <p>Temp: ${dataObj.temperature}\xB0C</p>
          <p>Humidity: ${dataObj.humidity * 100}%</p>
          <p>Pulse: ${dataObj.pulseCounter}</p>
        `;
        }
      } else {
        console.log("random data brrr");
        const container = document.getElementById("sensor-data");
        if (container) {
          container.innerHTML = `<p>random Value: ${dataObj.light}</p>`;
        }
      }
    }
  };
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
        type: "down",
        devEUI: DEVICE_EUI,
        cmd: "tx",
        port: fPort,
        data: hex,
        confirmed: false
      };
      socket.send(JSON.stringify(downMsg));
      console.log("\u2B07\uFE0F Sent downlink message:", downMsg);
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    setupDownlinkButton();
  });
})();
//# sourceMappingURL=app.js.map

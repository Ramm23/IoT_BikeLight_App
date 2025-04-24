// app.ts

// Your 16-hex-digit device EUI
const DEVICE_EUI = '00004A30B010D3F45';

interface UplinkInput {
  bytes: number[];
  fPort:  number;
  recvTime: string;
}

interface UplinkOutput {
  data?:    { light: number; [key:string]: any };
  warnings?: string[];
  errors?:   string[];
}

// decodeUplink (same as before)
function decodeUplink(input: UplinkInput): UplinkOutput {
  if (!input.bytes || input.bytes.length < 2) {
    return { errors: ["Not enough data to decode light sensor value"] };
  }
  const lightRaw   = (input.bytes[0] << 8) | input.bytes[1];
  return { data: { light: lightRaw }, warnings: [] };
}

// encodeDownlink (same as before)
type DownlinkOk  = { fPort: number; bytes: number[]; warnings: string[] };
type DownlinkErr = { errors: string[] };
type DownlinkResult = DownlinkOk | DownlinkErr;

function encodeDownlink(
  input: { data: { setCounter: boolean; range: number } }
): DownlinkResult {
  try {
    const { setCounter, range } = input.data;
    if (typeof range !== "number") {
      return { errors: ["Missing or invalid 'range' in downlink data"] };
    }
    const byte0 = setCounter ? 0x01 : 0x00;
    const byte1 = range & 0xff;
    return { fPort: 10, bytes: [byte0, byte1], warnings: [] };
  } catch (err: any) {
    return { errors: ["Failed to encode downlink: " + err.message] };
  }
}

// Open a WebSocket to your proxy (no secrets here)
const socket = new WebSocket(`ws://${globalThis.location.host}/ws`);

socket.onopen = () => {
  console.log("✅ Connected to proxy WebSocket");
};

socket.onerror = (err) => {
  console.error("⚠️ WebSocket error", err);
};

socket.onclose = () => {
  console.log("🛑 WebSocket closed");
};

socket.onmessage = (evt) => {
  const msg = JSON.parse(evt.data);

  // 1) Look for "rx" frames, and only for your device:
  if (msg.cmd === "rx" && msg.EUI === DEVICE_EUI) {
    // 2) Pull timestamp
    const recvTime = new Date(msg.ts).toISOString();

    // 3) If Loriot already decoded for you, use that:
    let dataObj: any;
    if (msg.decoded && msg.decoded.data) {
      dataObj = msg.decoded.data;
    } else {
      // 4) Otherwise parse the raw hex & run your decodeUplink
      const hex = msg.data as string;
      const bytes: number[] = [];
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
      }

      const uplink: UplinkInput = {
        bytes,
        fPort:   msg.port,    // e.g. 1 or whatever port
        recvTime
      };
      const decoded = decodeUplink(uplink);
      if (decoded.errors && decoded.errors.length) {
        console.error("Decoding errors:", decoded.errors);
        return;
      }
      dataObj = decoded.data!;
    }

    // 5) Update your UI however makes sense:
    //    e.g. if your sensor is light:
    if (typeof dataObj.light === "number") {
      const container = document.getElementById("sensor-data");
      if (container) {
        container.innerHTML = `<p>Light Sensor Value: ${dataObj.light}</p>`;
      }
    }

    //    or if your payload has temperature/humidity/pulseCounter:
    if (typeof dataObj.temperature === "number") {
      const container = document.getElementById("sensor-data");
      if (container) {
        container.innerHTML = `
          <p>Temp: ${dataObj.temperature}°C</p>
          <p>Humidity: ${dataObj.humidity * 100}%</p>
          <p>Pulse: ${dataObj.pulseCounter}</p>
        `;
      }
    }

    else{
      console.log("random data brrr")
      const container = document.getElementById("sensor-data");
      if (container) {
        container.innerHTML = `<p>random Value: ${dataObj.light}</p>`;
      }
    }
  }
};

/**
 * When the user clicks “Send Downlink”, encode & send a `down` message
 * over the same socket. Your server will forward it to Loriot.
 */
function setupDownlinkButton() {
  const btn = document.getElementById("sendDownlink");
  if (!btn) return console.error("Send button not found");

  btn.addEventListener("click", () => {
    const result = encodeDownlink({ data: { setCounter: true, range: 1 } });
    if ("errors" in result) {
      console.error("Encode errors:", result.errors);
      return;
    }
    const { fPort, bytes } = result;
    const hex = bytes.map(b => b.toString(16).padStart(2, "0")).join("");

    // Build the downlink envelope Loriot expects
    const downMsg = {
      type:  "down",
      devEUI: DEVICE_EUI,
      cmd:   "tx",
      port:  fPort,
      data:  hex,
      confirmed: false
    };

    socket.send(JSON.stringify(downMsg));
    console.log("⬇️ Sent downlink message:", downMsg);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupDownlinkButton();
});

// app.ts

// Your 16-hex-digit device EUI, hard-coded so the browser bundle can see it:
const DEVICE_EUI = '0004A30B010624BC';

const proto = location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${proto}//${location.host}/ws`);

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

interface DownlinkOutput {
  data?:    { setCounter: boolean; range: number };
  warnings?: string[];
  errors?:   string[];
}

// --- decodeUplink (unchanged) ---
function decodeUplink(input: UplinkInput): UplinkOutput {
  const maybeAscii = String.fromCharCode(...input.bytes);
  if (/^[0-9A-Fa-f]+$/.test(maybeAscii)) {
    return { data: { light: parseInt(maybeAscii, 16) }, warnings: [] };
  }
  if (input.bytes.length < 2) {
    return { errors: ["Not enough data to decode"] };
  }
  const lightRaw = (input.bytes[0] << 8) | input.bytes[1];
  return { data: { light: lightRaw }, warnings: [] };
}

// --- decodeDownlink (you already had this) ---
function decodeDownlink(hex: string): DownlinkOutput {
  if (typeof hex !== "string" || hex.length < 4) {
    return { errors: ["Invalid downlink hex"] };
  }
  try {
    const b0 = parseInt(hex.substr(0, 2), 16);
    const b1 = parseInt(hex.substr(2, 2), 16);
    const setCounter = !!(b0 & 0x01);
    const range = b1;
    return { data: { setCounter, range }, warnings: [] };
  } catch (e: any) {
    return { errors: ["Failed to decode downlink: " + e.message] };
  }
}

// --- encodeDownlink (NEW) ---
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

socket.onopen = () => {
  console.log("✅ Connected to proxy WebSocket");
  // 1) pull history
  socket.send(JSON.stringify({ cmd: 'cq', page: 1 }));
  // 2) then subscribe to just your device
  socket.send(JSON.stringify({ cmd: 'sub', EUI: DEVICE_EUI }));
};

socket.onerror = err => {
  console.error("⚠️ WebSocket error", err);
};

socket.onclose = () => {
  console.log("🛑 WebSocket closed");
};



socket.onmessage = evt => {
  const msg = JSON.parse(evt.data);
  // handle the history response
  if (msg.cmd === 'cq') {
    console.log("history:", msg.cache);
    msg.cache
      .filter((item: { EUI: string; }) => item.EUI === DEVICE_EUI)
      .forEach(renderFrame);
    return;
  }

  // only pay attention to gateway/uplink frames
  if ((msg.cmd === 'gw' || msg.cmd === 'rx') && msg.EUI === DEVICE_EUI) {
    renderFrame(msg);
  }

  // downlink confirms
  if ((msg.cmd === 'tx' || msg.cmd === 'mtx') && msg.EUI === DEVICE_EUI) {
    console.log("downlink enqueued:", msg);
  }
};

function renderFrame(frame: any) {
  const hex = frame.data as string;
  // turn "30313139" → [0x30,0x31,0x31,0x39]
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  const uplink: UplinkInput = {
    bytes,
    fPort:   frame.port,
    recvTime: new Date(frame.ts).toISOString()
  };
  const decoded = decodeUplink(uplink);
  if (decoded.errors?.length) {
    console.error("decodeUplink error", decoded.errors);
    return;
  }

  const container = document.getElementById("sensor-data");
  if (!container) return;
  container.innerHTML = 
    decoded.data!.light != null
      ? `<p>Light sensor: ${decoded.data!.light}</p>`
      : `<p>Raw data: ${JSON.stringify(decoded.data)}</p>`;
}


function setupDownlinkButton() {
  const btn = document.getElementById("sendDownlink");
  if (!btn) return console.error("Send button not found");

  btn.addEventListener("click", () => {
    // 1) build your payload bytes however you already do...
    const result = encodeDownlink({ data: { setCounter: true, range: 1 } });
    if ("errors" in result) {
      console.error("Encode errors:", result.errors);
      return;
    }
    const { fPort, bytes } = result;
    const hex = bytes.map(b => b.toString(16).padStart(2, "0")).join("");

    // 2) now build the exact JSON Loriot wants:
    const downMsg = {
      cmd:       "tx",
      EUI:       DEVICE_EUI,  // field name must be "EUI"
      data:      hex,
      port:      2,           // fport number
      confirmed: false,
      priority:  0            // include priority, even if zero
    };

    // 3) send it
    socket.send(JSON.stringify(downMsg));
    console.log("⬇️ Sent downlink message:", downMsg);
  });
}


document.addEventListener("DOMContentLoaded", setupDownlinkButton);

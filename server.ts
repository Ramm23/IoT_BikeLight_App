// server.ts
import { extname, join } from "https://deno.land/std@0.177.0/path/mod.ts";
import { contentType }    from "https://deno.land/std@0.177.0/media_types/mod.ts";

const LORIOT_SERVER = Deno.env.get("LORIOT_SERVER")!;
const LORIOT_TOKEN  = Deno.env.get("LORIOT_TOKEN")!;
const DEVICE_EUI    = Deno.env.get("DEVICE_EUI")!;
const LORIOT_WS_URL = `wss://${LORIOT_SERVER}/app?token=${LORIOT_TOKEN}`;

console.log("▶️  Starting server on http://localhost:8000");

Deno.serve(async (req: Request): Promise<Response> => {
  const url      = new URL(req.url);
  const pathname = url.pathname;
  const method   = req.method;

  // 1) WebSocket proxy
  if (pathname === "/ws") {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Upgrade Required", { status: 400 });
    }

    // upgrade the client connection
    const { socket: client, response } = Deno.upgradeWebSocket(req);

    let upstream: WebSocket;
    let reconnectTimer: number;

    const connectUpstream = () => {
      console.log("→ Connecting to Loriot:", LORIOT_WS_URL);
      upstream = new WebSocket(LORIOT_WS_URL);

      upstream.onopen = () => {
        console.log("✅ Connected to Loriot WS");
        // ask for history (optional):
        upstream.send(JSON.stringify({ cmd: "cq", page: 1 }));
        // then subscribe to all frames for your device:
        upstream.send(JSON.stringify({ cmd: "sub", EUI: DEVICE_EUI }));
      };

      upstream.onmessage = (evt) => {
        // try JSON‐parse; if it’s your device, forward it
        try {
          const msg = JSON.parse(evt.data);
          if (msg.EUI === DEVICE_EUI || msg.devEUI === DEVICE_EUI) {
            client.send(evt.data);
          }
        } catch {
          // if it wasn’t JSON, just relay raw
          client.send(evt.data);
        }
      };

      upstream.onerror = (err) => {
        console.error("⚠️  Loriot WS error:", err);
        // let onclose handle reconnect
      };

      upstream.onclose = () => {
        console.warn("ℹ️  Loriot WS closed, retrying in 5s");
        reconnectTimer = setTimeout(connectUpstream, 5_000);
      };
    };

    client.onclose = () => {
      console.log("🛑 Client disconnected; closing upstream");
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.close();
      }
    };

    client.onmessage = (evt) => {
      // any “down” you send from the browser goes upstream unchanged
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(evt.data);
      }
    };

    // start it
    connectUpstream();
    return response;
  }

  // 2) static file serving
  if (method === "GET") {
    const fp       = pathname === "/" ? "/index.html" : pathname;
    const safePath = join("", fp);
    const fullPath = join(Deno.cwd(), "public", safePath);

    try {
      const data = await Deno.readFile(fullPath);
      const ct   = contentType(extname(fullPath)) || "application/octet-stream";
      return new Response(data, {
        status: 200,
        headers: { "content-type": ct },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }

  // 3) everything else
  return new Response("Method Not Allowed", { status: 405 });
});

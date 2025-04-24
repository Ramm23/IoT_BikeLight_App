// server.ts
import { Application, Router, send } from "https://deno.land/x/oak@v17.1.4/mod.ts";

// pull your Loriot credentials from env
const LORIOT_SERVER  = Deno.env.get('LORIOT_SERVER')!;   // e.g. "eu3.loriot.io"
const LORIOT_APPID   = Deno.env.get('LORIOT_APPID')!;    // e.g. "12345678"
const LORIOT_API_KEY = Deno.env.get('LORIOT_API_KEY')!;  // your token blob or API key
const DEVICE_EUI     = Deno.env.get('DEVICE_EUI')!;      // your 16-hex-digit DevEUI

const app = new Application();
const router = new Router();

// static file middleware (unchanged) …
app.use(async (ctx, next) => {
  if (ctx.request.method === 'GET') {
    let fp = ctx.request.url.pathname;
    if (fp === '/') fp = '/index.html';
    try {
      await send(ctx, fp, { root: `${Deno.cwd()}/public` });
      return;
    } catch {
      // fall through to router
    }
  }
  await next();
});

// CORS if you need REST endpoints (unchanged) …
app.use(async (ctx, next) => {
  ctx.response.headers.set('Access-Control-Allow-Origin', '*');
  ctx.response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  ctx.response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  if (ctx.request.method === 'OPTIONS') {
    ctx.response.status = 204;
  } else {
    await next();
  }
});

// server.ts (inside router.get('/ws', …))
router.get('/ws', (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(400, 'WebSocket upgrade required');
  }
  const client = ctx.upgrade();

  // pull your real credentials from env
  const LORIOT_SERVER  = Deno.env.get('LORIOT_SERVER')!;
  const LORIOT_APPID   = Deno.env.get('LORIOT_APPID')!;
  const LORIOT_API_KEY = Deno.env.get('LORIOT_API_KEY')!;
  const DEVICE_EUI     = Deno.env.get('DEVICE_EUI')!;

  // make sure you include both appid & token
  const loriotUrl = `wss://iotnet.teracom.dk/app?token=vnoWXAAAABFpb3RuZXQudGVyYWNvbS5kaw9vz-jYaZlFTGEH4ILUpFU=`;

  let external: WebSocket;
  let reconnectTimer: number;

  function connectUpstream() {
    console.log('→ Connecting to Loriot:', loriotUrl);
    external = new WebSocket(loriotUrl);

    external.onopen = () => {
      console.log('✅ Loriot WS connected');
      // if Loriot requires a “subscribe” message, you could send it here:
      // external.send(JSON.stringify({ cmd: 'sub' }));
    };

    external.onmessage = (e) => {
      // forward only your device’s frames
      try {
        const msg = JSON.parse(e.data);
        if (msg.devEUI === DEVICE_EUI) {
          client.send(e.data);
        }
      } catch {
        // if it wasn’t JSON, just relay it
        client.send(e.data);
      }
    };

    external.onerror = (err) => {
      console.error('⚠️ Loriot WS error', err);
      // we’ll let onclose handle reconnection
    };

    external.onclose = () => {
      console.warn('ℹ️ Loriot WS closed, will reconnect in 5s');
      // don’t close the client socket, but retry upstream:
      reconnectTimer = setTimeout(connectUpstream, 5000);
    };
  }

  // when the browser‐client disconnects, tear down upstream too
  client.onclose = () => {
    console.log('🛑 Client disconnected; closing upstream');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (external.readyState === WebSocket.OPEN) {
      external.close();
    }
  };

  // any “downlink” messages from client go upstream
  client.onmessage = (e) => {
    if (external.readyState === WebSocket.OPEN) {
      external.send(e.data);
    }
  };

  // kick off
  connectUpstream();
});


app.use(router.routes());
app.use(router.allowedMethods());

console.log('Server running on http://localhost:8000');
await app.listen({ port: 8000 });

import { Buffer } from "node:buffer";

// lrt-token.ts
export interface AppToken {
    appId:       number;
    serverUrl:   string;
    secretHex:   string;   // 16-byte key as a hex string
  }
  
  const URL_SAFE_RE = /[-_]/g;
  const toStd       = (c: string) => c === '-' ? '+' : '/';
  const toUrlSafe   = (c: string) => c === '+' ? '-' : '_';
  
  export function decodeAppToken(blob: string): AppToken {
    // 1) revert URL-safe → standard
    const stdB64 = blob.replace(URL_SAFE_RE, toStd);
    const buf    = Buffer.from(stdB64, 'base64');
  
    // 2) pull apart fields
    let offset      = 0;
    const appId     = buf.readUInt32BE(offset);           offset += 4;
    const urlLen    = buf.readUInt32BE(offset);           offset += 4;
    const serverUrl = buf.slice(offset, offset + urlLen).toString('utf8');
                       offset += urlLen;
    const secretHex = buf.slice(offset, offset + 16).toString('hex');
  
    return { appId, serverUrl, secretHex };
  }
  
  export function encodeAppToken(token: AppToken): string {
    const { appId, serverUrl, secretHex } = token;
    const urlBuf    = Buffer.from(serverUrl, 'utf8');
    const secretBuf = Buffer.from(secretHex, 'hex');
    const buf       = Buffer.allocUnsafe(8 + urlBuf.length + 16);
  
    let off = 0;
    buf.writeUInt32BE(appId,        off); off += 4;
    buf.writeUInt32BE(urlBuf.length, off); off += 4;
    urlBuf.copy(buf, off);                  off += urlBuf.length;
    secretBuf.copy(buf, off);
  
    return buf
      .toString('base64')
      .replace(URL_SAFE_RE, toStd) // undo any previous URL-safe
      .replace(/\+/g, '-')        // make URL-safe
      .replace(/\//g, '_');
  }
  
// A random id created once per phone/browser and kept. The server ties each staff account to one of these.
const KEY = 'deviceId';
let memory = '';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // storage blocked (private mode): fall back to an id that lasts until the page is reloaded
    return memory || (memory = newId());
  }
}

function newId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c?.getRandomValues ? c.getRandomValues(bytes) : bytes.forEach((_, i) => (bytes[i] = Math.floor(Math.random() * 256)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

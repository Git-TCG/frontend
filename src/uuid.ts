/**
 * UUID v4. crypto.randomUUID는 HTTPS·localhost 같은 보안 컨텍스트에서만 있어서
 * http://192.168.0.33:8123 처럼 LAN 주소로 접속하면 없다. getRandomValues는 어디서나 쓸 수 있다.
 */
export function uuidV4(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

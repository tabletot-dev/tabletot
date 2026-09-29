// Payload for a "join this Wi-Fi" QR — the WIFI: format phone cameras understand.
// Special characters in the name/password must be backslash-escaped.
const esc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");

export function wifiQrPayload(ssid: string, password: string): string {
  return password
    ? `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;`
    : `WIFI:T:nopass;S:${esc(ssid)};;`;
}

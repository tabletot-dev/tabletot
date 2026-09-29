import { describe, it, expect } from "vitest";
import { wifiQrPayload } from "@/lib/wifi";

describe("wifiQrPayload", () => {
  it("open network when there is no password", () => {
    expect(wifiQrPayload("SILVER-GUEST", "")).toBe("WIFI:T:nopass;S:SILVER-GUEST;;");
  });

  it("WPA network with a password", () => {
    expect(wifiQrPayload("SILVER-GUEST", "beans123")).toBe("WIFI:T:WPA;S:SILVER-GUEST;P:beans123;;");
  });

  it("escapes characters that would break the payload", () => {
    expect(wifiQrPayload("Cafe;1", 'p:a"s,s\\')).toBe('WIFI:T:WPA;S:Cafe\\;1;P:p\\:a\\"s\\,s\\\\;;');
  });
});

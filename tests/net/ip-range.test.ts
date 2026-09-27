import { describe, expect, it } from "vitest";
import { isPublicIp } from "@/lib/net/ip-range";

describe("isPublicIp (anti-SSRF)", () => {
  it("recusa IPv4 privado, loopback, link-local, CGNAT, metadata, multicast e reservado", () => {
    const blocked = [
      "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1",
      "127.0.0.1", "127.255.255.255", "100.64.0.1", "169.254.169.254", "169.254.1.1",
      "224.0.0.1", "240.0.0.1", "255.255.255.255", "0.0.0.0", "192.0.2.1", "198.51.100.1", "203.0.113.1",
    ];
    for (const ip of blocked) expect(isPublicIp(ip, 4), ip).toBe(false);
  });

  it("aceita IPv4 público", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1"]) {
      expect(isPublicIp(ip, 4), ip).toBe(true);
    }
  });

  it("recusa IPv6 loopback, link-local, ULA, multicast e IPv4-mapeado privado", () => {
    const blocked = ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "2001:db8::1"];
    for (const ip of blocked) expect(isPublicIp(ip, 6), ip).toBe(false);
  });

  it("aceita IPv6 público (inclusive IPv4-mapeado público)", () => {
    for (const ip of ["2001:4860:4860::8888", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPublicIp(ip, 6), ip).toBe(true);
    }
  });
});

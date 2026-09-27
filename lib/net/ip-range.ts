// Classificação de IP público × privado (S25, anti-SSRF do envio de webhooks). Puro, sem I/O: fácil de testar com
// exaustão de faixas. IPv4 mapeado em IPv6 (`::ffff:a.b.c.d`) é desembrulhado antes de classificar.

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function inCidr(ipInt: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base)!;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

// Faixas privadas/reservadas/não roteáveis relevantes para SSRF (RFC 1918, loopback, link-local, CGNAT,
// metadata de nuvem, multicast, reservado, "this network", broadcast).
const IPV4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (inclui 169.254.169.254, metadata AWS/GCP/Azure)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservado
  ["255.255.255.255", 32], // broadcast
];

function isPublicIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return !IPV4_BLOCKED.some(([base, bits]) => inCidr(n, base, bits));
}

function firstHextet(ip: string): number {
  if (ip.startsWith("::")) return 0;
  const seg = ip.split(":")[0]!;
  const n = Number.parseInt(seg, 16);
  return Number.isNaN(n) ? 0 : n;
}

function isPublicIpv6(ipRaw: string): boolean {
  const ip = ipRaw.toLowerCase();
  if (ip === "::1") return false; // loopback
  if (ip === "::") return false; // unspecified
  // IPv4 mapeado: ::ffff:a.b.c.d
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  if (mapped) return isPublicIpv4(mapped[1]!);
  const g = firstHextet(ip);
  if (g >= 0xfe80 && g <= 0xfebf) return false; // link-local fe80::/10
  if (g >= 0xfc00 && g <= 0xfdff) return false; // ULA fc00::/7
  if (g >= 0xff00 && g <= 0xffff) return false; // multicast ff00::/8
  if (ip.startsWith("2001:db8:")) return false; // documentação
  if (ip.startsWith("64:ff9b::")) return false; // NAT64 (pode encapsular IPv4 privado; recusa por precaução)
  return true;
}

export function isPublicIp(ip: string, family: 4 | 6): boolean {
  return family === 4 ? isPublicIpv4(ip) : isPublicIpv6(ip);
}

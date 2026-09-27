import { BlockList } from "node:net";

// Classificação de IP público × privado (S25, anti-SSRF do envio de webhooks). Puro, sem I/O: fácil de testar com
// exaustão de faixas. IPv4 mapeado em IPv6 (`::ffff:a.b.c.d`) é desembrulhado antes de classificar.
//
// Revisão de segurança independente (Importante 4): a versão anterior do IPv6 negava faixa por faixa (default
// ALLOW) — qualquer faixa reservada esquecida da lista passava como pública. Trocado para DEFAULT-DENY: só é
// público se estiver dentro de `2000::/3` (o bloco de unicast global atual, RFC 4291) e fora das faixas especiais
// que caem DENTRO dele (documentação, Teredo, 6to4). Loopback, link-local, ULA, multicast, IPv4-mapeado,
// discard-only (`100::/64`) e NAT64 (`64:ff9b::/96`) já ficam de fora só por estarem fora de `2000::/3` — não
// precisam de entrada própria na lista (cobertos pelos testes com `::127.0.0.1`, `::a9fe:a9fe`, `::ffff:7f00:1`).

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

// Unicast global atual (RFC 4291 §2.4): só endereços aqui dentro podem ser públicos.
const GLOBAL_UNICAST = new BlockList();
GLOBAL_UNICAST.addSubnet("2000::", 3, "ipv6");

// Faixas especiais que caem DENTRO de `2000::/3` mas não são endereçáveis publicamente de forma confiável.
const SPECIAL_WITHIN_GLOBAL_UNICAST = new BlockList();
SPECIAL_WITHIN_GLOBAL_UNICAST.addSubnet("2001:db8::", 32, "ipv6"); // documentação (RFC 3849)
SPECIAL_WITHIN_GLOBAL_UNICAST.addSubnet("2001::", 32, "ipv6"); // Teredo (RFC 4380) — encapsula IPv4, pode ser privado
SPECIAL_WITHIN_GLOBAL_UNICAST.addSubnet("2002::", 16, "ipv6"); // 6to4 (RFC 3056) — idem

function isPublicIpv6(ipRaw: string): boolean {
  const ip = ipRaw.toLowerCase();
  // IPv4 mapeado em forma pontuada (::ffff:a.b.c.d): desembrulha e classifica como IPv4. Uma forma hexadecimal
  // (ex. `::ffff:7f00:1`) não bate este regex e cai no default-deny abaixo (fora de `2000::/3`) — nunca passa
  // como pública por engano.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  if (mapped) return isPublicIpv4(mapped[1]!);
  if (!GLOBAL_UNICAST.check(ip, "ipv6")) return false;
  if (SPECIAL_WITHIN_GLOBAL_UNICAST.check(ip, "ipv6")) return false;
  return true;
}

export function isPublicIp(ip: string, family: 4 | 6): boolean {
  return family === 4 ? isPublicIpv4(ip) : isPublicIpv6(ip);
}

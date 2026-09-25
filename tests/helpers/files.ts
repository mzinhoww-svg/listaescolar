export const enc = (s: string) => new TextEncoder().encode(s);

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export const pdf = () => enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
export const encryptedPdf = () => enc("%PDF-1.6\n1 0 obj\n<< >>\nendobj\ntrailer\n<< /Encrypt 5 0 R >>\n%%EOF\n");
export const truncatedPdf = () => enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog");

export function png(w = 100, h = 100): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set(enc("IHDR"), 12);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

export function jpeg(w = 100, h = 100): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0], 0); // SOI + APP0 (len 4)
  b.set([0xff, 0xc0, 0, 11, 8], 8); // SOF0
  const dv = new DataView(b.buffer);
  dv.setUint16(13, h);
  dv.setUint16(15, w);
  return b;
}

export const webp = () => concat(enc("RIFF"), new Uint8Array([0, 0, 0, 0]), enc("WEBP"), enc("VP8 "), new Uint8Array(16));
export const heic = () => concat(new Uint8Array([0, 0, 0, 24]), enc("ftypheic"), new Uint8Array(16));
export const exe = () => concat(enc("MZ"), new Uint8Array(200));

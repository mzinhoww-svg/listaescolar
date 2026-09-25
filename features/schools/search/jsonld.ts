import type { SchoolProfile } from "./types";

type Json = Record<string, unknown>;

/** JSON-LD `School` só com campos que existem; nunca e-mail. `baseUrl` (origem) é opcional. */
export function buildSchoolJsonLd(school: SchoolProfile, baseUrl?: string): Json {
  const address: Json = { "@type": "PostalAddress", addressCountry: "BR" };
  if (school.address) address.streetAddress = school.address;
  if (school.municipalityName) address.addressLocality = school.municipalityName;
  if (school.uf) address.addressRegion = school.uf;

  const out: Json = {
    "@context": "https://schema.org",
    "@type": "School",
    name: school.name,
    identifier: school.inep,
    address,
  };
  if (school.phone) out.telephone = `+55${school.phone}`;
  if (baseUrl) out.url = `${baseUrl.replace(/\/+$/, "")}/escolas/${school.inep}`;
  return JSON.parse(JSON.stringify(out)) as Json; // remove chaves undefined
}

const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");

/** Serializa para <script type="application/ld+json">: escapa `<` (e separadores de linha) contra fechamento de tag. */
export function serializeJsonLd(data: Json): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(LS, "\\u2028").replace(PS, "\\u2029");
}

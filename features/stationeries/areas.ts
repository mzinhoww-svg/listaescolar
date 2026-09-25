import { neighborhoodLabel, normalizeNeighborhood } from "./neighborhood";

/** Bairros atendidos: um por linha ou separados por vírgula/ponto e vírgula. Repetidos (mesma chave) valem uma vez. */
export function splitAreas(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,;]+/)) {
    const name = neighborhoodLabel(part);
    const key = normalizeNeighborhood(name);
    if (key !== "" && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

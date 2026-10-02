/**
 * Caminho normalizado para eventos: segmento com dígito (INEP, uuid, código) vira `[id]`; o resto é minúsculo.
 * Assim o caminho nunca carrega identificador de pessoa, pedido ou lista.
 */
export function routeTemplate(pathname: string): string {
  const segments = pathname
    .split("?")[0]!
    .split("/")
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => (/\d/.test(s) || !/^[a-z-]+$/i.test(s) ? "[id]" : s.toLowerCase()));
  return `/${segments.join("/")}`;
}

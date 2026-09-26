// Tabela de campos de um esquema (parâmetros ou corpo) a partir do JSON Schema gerado por `z.toJSONSchema` do
// próprio contrato (B2B03/`/parceiros/docs`) — nunca uma lista escrita à mão que possa divergir do contrato real.

type JsonSchemaProperty = {
  type?: string | readonly string[];
  format?: string;
  description?: string;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
};
export type ObjectJsonSchema = { properties?: Record<string, JsonSchemaProperty>; required?: readonly string[] };

function typeOf(type: JsonSchemaProperty["type"]): string | undefined {
  if (Array.isArray(type)) return (type as readonly string[]).join(" | ");
  return type as string | undefined;
}

function typeLabel(p: JsonSchemaProperty): string {
  if (p.enum) return p.enum.map(String).join(" | ");
  const t = typeOf(p.type);
  if (t === "integer" || t === "number") {
    const range = p.minimum !== undefined || p.maximum !== undefined ? ` (${p.minimum ?? "…"}–${p.maximum ?? "…"})` : "";
    return `${t}${range}`;
  }
  if (t === "string" && (p.minLength !== undefined || p.maxLength !== undefined)) {
    return `string (${p.minLength ?? 0}–${p.maxLength ?? "…"} car.)`;
  }
  return t ?? "—";
}

export function SchemaTable({ schema, caption }: { schema: ObjectJsonSchema | undefined; caption: string }) {
  const properties = Object.entries(schema?.properties ?? {});
  if (properties.length === 0) return null;
  const required = new Set(schema?.required ?? []);
  return (
    <table className="w-full text-left text-[13px]">
      <caption className="text-texto-3 mb-1.5 text-left text-[12px] font-extrabold tracking-[0.04em] uppercase">{caption}</caption>
      <thead>
        <tr className="text-texto-3 text-[11px] uppercase">
          <th className="py-1 pr-3 font-extrabold">Campo</th>
          <th className="py-1 pr-3 font-extrabold">Tipo</th>
          <th className="py-1 pr-3 font-extrabold">Obrigatório</th>
          <th className="py-1 font-extrabold">Descrição</th>
        </tr>
      </thead>
      <tbody>
        {properties.map(([name, p]) => (
          <tr key={name} className="border-linha border-t">
            <td className="py-1.5 pr-3 font-mono font-bold">{name}</td>
            <td className="py-1.5 pr-3">{typeLabel(p)}</td>
            <td className="py-1.5 pr-3">{required.has(name) ? "Sim" : "Não"}</td>
            <td className="py-1.5 text-texto-2">{p.description ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

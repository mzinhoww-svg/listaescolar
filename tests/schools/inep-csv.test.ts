// @vitest-environment node
import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { parseInepCsv } from "@/features/schools/inep-csv";
import { InepRowSchema, parseInepRow } from "@/features/schools/schemas";

const HEADER = "CO_ENTIDADE;NO_ENTIDADE;CO_MUNICIPIO;TP_DEPENDENCIA";
const buf = (s: string) => Buffer.from(s, "utf8");

describe("parseInepCsv", () => {
  it("lê ; e , (detecta o separador)", () => {
    const a = parseInepCsv(buf(`${HEADER}\n51000001;Escola A;5103403;3\n`));
    expect(a.delimiter).toBe(";");
    expect(a.errors).toEqual([]);
    expect(a.rows[0]).toMatchObject({ CO_ENTIDADE: "51000001", NO_ENTIDADE: "Escola A" });
    const b = parseInepCsv(buf(HEADER.replaceAll(";", ",") + "\n51000001,Escola A,5103403,3\n"));
    expect(b.delimiter).toBe(",");
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]?.TP_DEPENDENCIA).toBe("3");
  });

  it("aceita UTF-8 com BOM", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf(`${HEADER}\n51000001;Ação;5103403;3\n`)]);
    const r = parseInepCsv(withBom);
    expect(r.errors).toEqual([]);
    expect(r.encoding).toBe("utf-8");
    expect(r.rows[0]?.NO_ENTIDADE).toBe("Ação");
  });

  it("detecta latin1", () => {
    const latin = iconv.encode(`${HEADER}\n51000001;Escola São José;5103403;3\n`, "latin1");
    const r = parseInepCsv(latin);
    expect(r.encoding).toBe("latin1");
    expect(r.rows[0]?.NO_ENTIDADE).toBe("Escola São José");
  });

  it("trata aspas e quebra de linha dentro do campo", () => {
    const r = parseInepCsv(buf(`${HEADER}\n51000001;"Escola ""A""\nAnexo; parte";5103403;3\n`));
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.NO_ENTIDADE).toBe('Escola "A"\nAnexo; parte');
  });

  it("falha com coluna obrigatória ausente, listando as colunas", () => {
    const r = parseInepCsv(buf("CO_ENTIDADE;NO_ENTIDADE\n51000001;Escola A\n"));
    expect(r.rows).toEqual([]);
    const cols = r.errors.filter((e) => e.code === "missing_column").map((e) => e.column);
    expect(cols).toEqual(["CO_MUNICIPIO", "TP_DEPENDENCIA"]);
  });

  it("falha com colunas duplicadas", () => {
    const r = parseInepCsv(buf(`${HEADER};NO_ENTIDADE\n51000001;A;5103403;3;B\n`));
    expect(r.rows).toEqual([]);
    expect(r.errors).toContainEqual(expect.objectContaining({ code: "duplicate_column", column: "NO_ENTIDADE" }));
  });

  it("ignora linha vazia final e linhas em branco", () => {
    const r = parseInepCsv(buf(`${HEADER}\n51000001;A;5103403;3\n\n;;;\n51000002;B;5103403;3\n\n`));
    expect(r.rows.map((x) => x.CO_ENTIDADE)).toEqual(["51000001", "51000002"]);
  });

  it("aceita cabeçalho em outra caixa e com espaços, e ignora colunas extras", () => {
    const r = parseInepCsv(buf(" co_entidade ;No_Entidade;co_municipio;tp_dependencia;EXTRA\n51000001;A;5103403;3;x\n"));
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toEqual({
      CO_ENTIDADE: "51000001",
      NO_ENTIDADE: "A",
      CO_MUNICIPIO: "5103403",
      TP_DEPENDENCIA: "3",
    });
  });

  it("não altera células que começam com fórmula (a neutralização é do relatório)", () => {
    const r = parseInepCsv(buf(`${HEADER}\n51000001;=cmd|' /c calc'!A0;5103403;3\n`));
    expect(r.rows[0]?.NO_ENTIDADE).toBe("=cmd|' /c calc'!A0");
  });

  it("arquivo vazio, só BOM e aspas abertas viram erro de arquivo", () => {
    expect(parseInepCsv(Buffer.alloc(0)).errors[0]?.code).toBe("empty_file");
    expect(parseInepCsv(Buffer.from([0xef, 0xbb, 0xbf])).errors[0]?.code).toBe("empty_file");
    expect(parseInepCsv(buf(`${HEADER}\n51000001;"aberta;5103403;3\n`)).errors[0]?.code).toBe("invalid_csv");
  });

  it("só cabeçalho: zero linhas, sem erro", () => {
    const r = parseInepCsv(buf(`${HEADER}\n`));
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([]);
  });

  it("linha com menos colunas fica com células vazias", () => {
    const r = parseInepCsv(buf(`${HEADER}\n51000001;A\n`));
    expect(r.rows[0]).toMatchObject({ CO_ENTIDADE: "51000001", CO_MUNICIPIO: "", TP_DEPENDENCIA: "" });
  });
});

describe("InepRowSchema", () => {
  const ok = {
    CO_ENTIDADE: "51000001",
    NO_ENTIDADE: "E.M. Prof. José",
    CO_MUNICIPIO: "5103403",
    TP_DEPENDENCIA: "3",
    DS_ENDERECO: "Rua A",
    NU_ENDERECO: "10",
    NO_BAIRRO: "Centro",
    CO_CEP: "78000-000",
    NU_DDD: "65",
    NU_TELEFONE: "3333-0001",
    DS_EMAIL: "A@B.COM",
  };
  it("normaliza uma linha válida", () => {
    const r = InepRowSchema.parse(ok);
    expect(r).toEqual({
      inep: "51000001",
      name: "E.M. Prof. José",
      normalizedName: "escola municipal professor jose",
      network: "municipal",
      ibgeCode: "5103403",
      neighborhood: "Centro",
      address: "Rua A, 10",
      cep: "78000000",
      phone: "6533330001",
      email: "a@b.com",
    });
  });
  it("campos opcionais vazios viram null", () => {
    const r = InepRowSchema.parse({ ...ok, DS_ENDERECO: "", NU_ENDERECO: "", NO_BAIRRO: "", CO_CEP: "", DS_EMAIL: "" });
    expect(r).toMatchObject({ address: null, neighborhood: null, cep: null, email: null });
  });
  it.each([
    [{ CO_ENTIDADE: "123" }, "invalid_inep"],
    [{ CO_ENTIDADE: "" }, "invalid_inep"],
    [{ NO_ENTIDADE: "  " }, "invalid_name"],
    [{ TP_DEPENDENCIA: "7" }, "invalid_network"],
    [{ CO_MUNICIPIO: "Cuiabá" }, "invalid_municipality"],
    [{ CO_MUNICIPIO: "51034" }, "invalid_municipality"],
  ])("rejeita %j com %s", (patch, code) => {
    const r = parseInepRow({ ...ok, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.map((e) => e.code)).toContain(code);
  });
  it("acumula vários erros", () => {
    const r = parseInepRow({ ...ok, CO_ENTIDADE: "1", TP_DEPENDENCIA: "0" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.map((e) => e.code)).toEqual(["invalid_inep", "invalid_network"]);
  });
});

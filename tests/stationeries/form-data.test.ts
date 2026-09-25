import { describe, expect, it } from "vitest";

import { stepOfField, validateRegistration, validateStep } from "@/features/stationeries/form-data";
import { buildErrorReport } from "@/features/stationeries/error-report";
import { splitAreas } from "@/features/stationeries/areas";
import { adminActions } from "@/features/stationeries/admin-actions";
import { filterRows, parseTab } from "@/features/stationeries/admin-filter";
import { whatsappLink } from "@/features/stationeries/whatsapp";
import { canSubmitForReview } from "@/features/stationeries/submit-rules";

const MUNI = "11111111-1111-4111-8111-111111111111";
const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const good = {
  tradeName: "Papelaria Boa",
  legalName: "Boa Comércio Ltda",
  cnpj: "11.222.333/0001-81",
  municipalityId: MUNI,
  neighborhood: "Centro",
  whatsapp: "(65) 99999-1234",
  offersPickup: "on",
  serviceRadiusKm: "5",
  paymentMethods: ["pix", "cash"],
  areas: ["Centro", "Jardim"],
  lgpdAccepted: "on",
};

describe("formulário de cadastro", () => {
  it("válido: normaliza CNPJ e telefone", () => {
    const r = validateRegistration(form(good));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.basics.cnpj).toBe("11222333000181");
      expect(r.data.service.whatsapp).toBe("+5565999991234");
      expect(r.data.service.paymentMethods).toEqual(["pix", "cash"]);
    }
  });

  it("CNPJ inválido e LGPD ausente geram erros por campo", () => {
    const r = validateRegistration(form({ ...good, cnpj: "11.111.111/1111-11", lgpdAccepted: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.cnpj).toMatch(/inválido/i);
      expect(r.errors.lgpdAccepted).toBeTruthy();
    }
  });

  it("passo 1 sem dados: erros; passo 2 exige retirada, entrega ou bairro", () => {
    expect(Object.keys(validateStep("basics", form({})))).toEqual(expect.arrayContaining(["tradeName", "cnpj"]));
    expect(validateStep("service", form({ whatsapp: "(65) 99999-1234" })).offersPickup).toBeTruthy();
    expect(validateStep("service", form({ whatsapp: "(65) 99999-1234", areas: ["Centro"] }))).toEqual({});
  });

  it("stepOfField leva ao passo certo", () => {
    expect(stepOfField("cnpj")).toBe("basics");
    expect(stepOfField("whatsapp")).toBe("service");
    expect(stepOfField("lgpdAccepted")).toBe("consent");
  });
});

describe("relatório de erros do CSV", () => {
  it("neutraliza fórmulas e é baixável", () => {
    const r = buildErrorReport([{ line: 2, field: "nome", message: "Nome inválido.", value: "=HYPERLINK(\"x\")" }]);
    expect(r.csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(r.csv.split("\r\n")[0]).toBe("linha,campo,erro,valor");
    expect(r.href.startsWith("data:text/csv;charset=utf-8,")).toBe(true);
    expect(r.filename).toMatch(/\.csv$/);
  });
});

describe("apoios", () => {
  it("splitAreas separa, aparta duplicados e vazios", () => {
    expect(splitAreas("Centro\n Jardim ; centro,  ,Coophamil")).toEqual(["Centro", "Jardim", "Coophamil"]);
  });
  it("ações da equipe seguem a matriz do admin", () => {
    expect(adminActions("under_review").map((a) => a.to)).toEqual(["approved", "rejected", "suspended"]);
    expect(adminActions("under_review").find((a) => a.to === "rejected")?.reasonRequired).toBe(true);
    expect(adminActions("active").map((a) => a.to)).toEqual(["paused", "suspended"]);
    expect(adminActions("rejected")).toEqual([]);
  });
  it("filtro admin: aba e busca por CNPJ com ou sem máscara", () => {
    const rows = [
      { tradeName: "Alfa", cnpj: "11222333000181", neighborhood: "Centro", status: "under_review" as const },
      { tradeName: "Beta", cnpj: "45723174000110", neighborhood: "Jardim", status: "active" as const },
    ];
    expect(filterRows(rows, "pendentes", "")).toHaveLength(1);
    expect(filterRows(rows, "todas", "45.723.174")).toHaveLength(1);
    expect(filterRows(rows, "todas", "457231")).toHaveLength(1);
    expect(filterRows(rows, "todas", "jardim")).toHaveLength(1);
    expect(parseTab("x")).toBe("pendentes");
  });
  it("wa.me só com telefone válido", () => {
    expect(whatsappLink("(65) 99999-1234", "oi")).toBe("https://wa.me/5565999991234?text=oi");
    expect(whatsappLink("123", "oi")).toBeNull();
  });
  it("reenvio só nos estados do dono", () => {
    expect(canSubmitForReview("signup")).toBe(true);
    expect(canSubmitForReview("rejected")).toBe(true);
    expect(canSubmitForReview("under_review")).toBe(false);
    expect(canSubmitForReview("active")).toBe(false);
  });
});

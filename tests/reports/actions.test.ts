import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentRole = vi.fn();
const svc = { submit: vi.fn(), resolve: vi.fn() };
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: () => getCurrentUser(), getCurrentRole: () => getCurrentRole() }));
vi.mock("@/features/reports/wiring", () => ({ getReportsService: () => svc }));

import { resolveReportAction, submitReportAction } from "@/features/reports/actions";

const USER = "22222222-2222-4222-8222-222222222222";
const LIST_ID = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const REPORT_ID = "4f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};

async function redirected(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const m = /^REDIRECT:(.*)$/.exec((err as Error).message);
  if (!m) throw err;
  return m[1]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: USER, email: "pai@example.test" });
  getCurrentRole.mockResolvedValue("parent");
});

describe("submitReportAction", () => {
  it("next SEM query string: usa '?' antes de denunciaOk", async () => {
    svc.submit.mockResolvedValue(REPORT_ID);
    const to = await redirected(submitReportAction("/escolas/12345678", form({ targetType: "school_list", targetId: LIST_ID, reason: "outro" })));
    expect(to).toBe("/escolas/12345678?denunciaOk=1#denunciar");
  });

  it("next COM query string própria (?serie=...&ano=...): usa '&', nunca um segundo '?'", async () => {
    svc.submit.mockResolvedValue(REPORT_ID);
    const to = await redirected(submitReportAction("/escolas/12345678?serie=ef-3&ano=2027", form({ targetType: "school_list", targetId: LIST_ID, reason: "outro" })));
    expect(to).toBe("/escolas/12345678?serie=ef-3&ano=2027&denunciaOk=1#denunciar");
    expect(to.match(/\?/g)?.length).toBe(1);
  });

  it("erro do serviço: mesma regra de separador no redirect de erro", async () => {
    svc.submit.mockRejectedValue(new Error("boom"));
    const to = await redirected(submitReportAction("/escolas/12345678?serie=ef-3&ano=2027", form({ targetType: "school_list", targetId: LIST_ID, reason: "outro" })));
    expect(to).toBe("/escolas/12345678?serie=ef-3&ano=2027&denunciaErro=desconhecido#denunciar");
  });

  it("sem sessão: vai ao login com next codificado", async () => {
    getCurrentUser.mockResolvedValue(null);
    const to = await redirected(submitReportAction("/escolas/12345678", form({})));
    expect(to).toBe("/entrar?next=%2Fescolas%2F12345678");
  });
});

describe("resolveReportAction", () => {
  it("'reviewing': ignora resolution/resolutionNote mesmo se vierem no formData", async () => {
    svc.resolve.mockResolvedValue(undefined);
    const to = await redirected(resolveReportAction(form({ reportId: REPORT_ID, status: "reviewing", resolution: "upheld", resolutionNote: "algo" })));
    expect(to).toBe(`/admin/denuncias/${REPORT_ID}?ok=1`);
    expect(svc.resolve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "reviewing", resolution: null }));
  });

  it("'resolved' sem resolution: erro de validação, serviço nunca chamado", async () => {
    const to = await redirected(resolveReportAction(form({ reportId: REPORT_ID, status: "resolved" })));
    expect(to).toBe(`/admin/denuncias/${REPORT_ID}?erro=invalido`);
    expect(svc.resolve).not.toHaveBeenCalled();
  });
});

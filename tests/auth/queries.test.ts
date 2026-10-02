import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
const createClient = vi.fn();
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T extends (...a: never[]) => unknown>(fn: T) => {
    let memo: ReturnType<T> | undefined;
    return ((...a: never[]) => (memo ??= fn(...a) as ReturnType<T>)) as T;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));
const setRoleScope = vi.fn();
vi.mock("@/lib/observability/scope", () => ({ setRoleScope: (r: unknown) => setRoleScope(r) }));

describe("queries com cache por request", () => {
  beforeEach(() => {
    vi.resetModules();
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingle.mockReset().mockResolvedValue({ data: { role: "parent" } });
    createClient.mockReset().mockResolvedValue({
      auth: { getUser },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    });
    setRoleScope.mockReset();
  });

  it("um só getUser e um só select de profile", async () => {
    const { getCurrentRole, getCurrentUser } = await import("@/features/auth/queries");
    await getCurrentUser();
    await getCurrentRole();
    await getCurrentRole();
    await getCurrentUser();
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("sem usuário: papel null sem consultar profiles", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { getCurrentRole } = await import("@/features/auth/queries");
    expect(await getCurrentRole()).toBeNull();
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("papel inválido vira null", async () => {
    maybeSingle.mockResolvedValue({ data: { role: "root" } });
    const { getCurrentRole } = await import("@/features/auth/queries");
    expect(await getCurrentRole()).toBeNull();
  });

  it("D-005/S19: escopo do Sentry por papel, num único ponto (getCurrentRole)", async () => {
    const { getCurrentRole } = await import("@/features/auth/queries");
    await getCurrentRole();
    expect(setRoleScope).toHaveBeenCalledExactlyOnceWith("parent");
  });

  it("D-005/S19: sem usuário, escopo vira null (nunca um id)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { getCurrentRole } = await import("@/features/auth/queries");
    await getCurrentRole();
    expect(setRoleScope).toHaveBeenCalledExactlyOnceWith(null);
  });
});

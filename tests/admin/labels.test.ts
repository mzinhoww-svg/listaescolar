import { describe, expect, it } from "vitest";

import { SCHOOL_STATE_LABEL } from "@/features/admin/labels";

describe("rótulos do admin seguem o vocabulário das telas das famílias", () => {
  it("escola reivindicada = 'Em verificação' (nunca 'Reivindicada')", () => {
    expect(SCHOOL_STATE_LABEL.claimed).toBe("Em verificação");
  });
});

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkSent } from "@/app/entrar/LinkSent";

describe("LinkSent · mitigação do M16", () => {
  it("orienta a abrir o link no navegador do celular quando o acesso não funcionar dentro de outro app", () => {
    render(<LinkSent email="a@b.com" next="/" pending={false} resend={() => {}} onChangeEmail={() => {}} />);
    expect(screen.getByText(/abra o link no navegador do celular/)).toBeInTheDocument();
  });
});

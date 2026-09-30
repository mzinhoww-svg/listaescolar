import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
const otpSeconds = Number(/^otp_expiry\s*=\s*(\d+)/m.exec(config)?.[1]);
const minutes = otpSeconds / 60;

describe("UX-007 · modelos de e-mail do Auth versionados", () => {
  it("config.toml declara o prazo do link em segundos", () => {
    expect(Number.isInteger(minutes) && minutes > 0).toBe(true);
  });
  it.each(["magic_link", "confirmation"])("%s: logo, 'neste aparelho' e o prazo em minutos igual ao otp_expiry", (name) => {
    const html = readFileSync(join(root, `supabase/templates/${name}.html`), "utf8");
    expect(html).toMatch(/<img[^>]+src="\{\{ \.SiteURL \}\}\/brand\/logo-horizontal\.png"[^>]+alt="ListaCerta"/);
    expect(html).toMatch(/neste aparelho/i);
    expect(html).toContain(`${minutes} minutos`);
    expect(html).not.toMatch(/pouco tempo/i);
    expect(html).toContain("{{ .TokenHash }}");
  });
});

import { describe, expect, it } from "vitest";

import { notifyInputSchema } from "@/features/submissions/form-schema";

const ID = "30000000-0000-4000-8000-000000000001";
const wa = (target: string) => notifyInputSchema.safeParse({ submissionId: ID, channel: "whatsapp", target });

export const VALID_WHATSAPP: ReadonlyArray<readonly [string, string]> = [
  ["(65) 99999-0000", "+5565999990000"],
  ["65999990000", "+5565999990000"],
  ["6533334444", "+556533334444"],
  ["+55 65 99999-0000", "+5565999990000"],
  ["+1 (415) 555-2671", "+14155552671"],
  ["5565999990000", "+5565999990000"],
];
export const INVALID_WHATSAPP = ["", "abc", "+0655599990", "+55", "+1234567", "+1234567890123456", "99999", "0165999990", "065999990000", "123456789012345678"];

describe("notifyInputSchema · WhatsApp em E.164", () => {
  it.each(VALID_WHATSAPP)("%s vira %s", (input, expected) => {
    const r = wa(input);
    expect(r.success && r.data.target).toBe(expected);
  });
  it.each(INVALID_WHATSAPP)("recusa %j já no Zod", (input) => {
    expect(wa(input).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { chromeIntentUrl, detectInAppBrowser } from "@/features/auth/in-app-browser";

const UA = {
  whatsappAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.0.0 Mobile Safari/537.36 WhatsApp/2.23.20.0",
  whatsappIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/23.20.79 Safari/604.1",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SD1A.210817.036; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.5304.105 Mobile Safari/537.36 Instagram 270.0.0.13.83 Android (31/12; 420dpi; 1080x2209; Google/google; Pixel 6; oriole; oriole; en_US; 441458209)",
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20G75 Instagram 305.0.0.34.103 (iPhone14,5; iOS 16_6; pt_BR; pt-BR; scale=3.00; 1170x2532; 521256421)",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 11; moto g(9) play Build/RPXS31.Q4U-39-42-12-3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.5481.153 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/405.0.0.23.72;]",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 [FBAN/FBIOS;FBAV/430.0.0.30.114;FBBV/548287462;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.0;FBSS/3;FBID/phone;FBLC/pt_BR;FBOP/5]",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  desktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
};

describe("detectInAppBrowser", () => {
  it.each([
    ["whatsappAndroid", "whatsapp"],
    ["whatsappIos", "whatsapp"],
    ["instagramAndroid", "instagram"],
    ["instagramIos", "instagram"],
    ["facebookAndroid", "facebook"],
    ["facebookIos", "facebook"],
  ] as const)("%s é navegador embutido (%s)", (key, app) => {
    expect(detectInAppBrowser(UA[key])).toBe(app);
  });
  it.each(["chromeAndroid", "safariIos", "desktop"] as const)("%s é navegador comum", (key) => {
    expect(detectInAppBrowser(UA[key])).toBeNull();
  });
  it("UA vazio ou ausente não detecta", () => {
    expect(detectInAppBrowser("")).toBeNull();
    expect(detectInAppBrowser(undefined)).toBeNull();
  });
});

describe("chromeIntentUrl", () => {
  it("monta intent do Chrome preservando caminho e query", () => {
    expect(chromeIntentUrl("https://listacerta.test/entrar?next=%2Fconta")).toBe(
      "intent://listacerta.test/entrar?next=%2Fconta#Intent;scheme=https;package=com.android.chrome;end",
    );
  });
  it("rejeita URL inválida", () => {
    expect(chromeIntentUrl("não é url")).toBeNull();
  });
});

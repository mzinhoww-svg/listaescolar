import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom não implementa `HTMLDialogElement.showModal`/`close` (Dialog API); os diálogos de confirmação do B2B
// (`NewKeyDialog`, `RotateDialog`, `RevokeButton`, `DecisionForm`) usam `<dialog>` nativo, então os testes de
// componente precisam de um polyfill mínimo (alterna o atributo `open`, que o `.open` de jsdom já reflete).
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
}

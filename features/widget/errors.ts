export const WIDGET_SERVICE_ERROR_CODES = ["forbidden", "not_found", "invalid_input", "database"] as const;
export type WidgetServiceErrorCode = (typeof WIDGET_SERVICE_ERROR_CODES)[number];

export class WidgetServiceError extends Error {
  constructor(
    message: string,
    readonly code: WidgetServiceErrorCode,
    readonly dbCode?: string,
  ) {
    super(message);
    this.name = "WidgetServiceError";
  }
}

export function widgetDbErrorCode(error: { code?: string; hint?: string | null }): WidgetServiceErrorCode {
  if (error.hint === "forbidden") return "forbidden";
  if (error.hint === "not_found") return "not_found";
  if (error.hint === "invalid_input") return "invalid_input";
  switch (error.code) {
    case "P0002":
      return "not_found";
    case "42501":
      return "forbidden";
    case "22023":
    case "23514":
      return "invalid_input";
    default:
      return "database";
  }
}

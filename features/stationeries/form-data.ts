import { STATIONERY_STEP_SCHEMAS, type StationeryRegistration } from "./schemas";

export type FieldErrors = Record<string, string>;
export type FormValues = Record<string, string | string[]>;
export type RegisterState =
  | { status: "idle" }
  | { status: "error"; message: string; errors: FieldErrors; values: FormValues };

export type RegistrationStep = keyof typeof STATIONERY_STEP_SCHEMAS;

const str = (fd: FormData, key: string): string => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
const strs = (fd: FormData, key: string): string[] =>
  fd.getAll(key).filter((v): v is string => typeof v === "string" && v.trim() !== "");

/** Lê os campos de um passo do cadastro (a mesma leitura vale no cliente e no servidor). */
export function readStep(step: RegistrationStep, fd: FormData): Record<string, unknown> {
  if (step === "basics") {
    return {
      tradeName: str(fd, "tradeName"),
      legalName: str(fd, "legalName"),
      cnpj: str(fd, "cnpj"),
      municipalityId: str(fd, "municipalityId"),
      neighborhood: str(fd, "neighborhood"),
      address: str(fd, "address"),
      cep: str(fd, "cep"),
    };
  }
  if (step === "service") {
    return {
      whatsapp: str(fd, "whatsapp"),
      phone: str(fd, "phone"),
      email: str(fd, "email"),
      offersPickup: fd.get("offersPickup") === "on",
      offersDelivery: fd.get("offersDelivery") === "on",
      serviceRadiusKm: str(fd, "serviceRadiusKm") || "0",
      openingHours: str(fd, "openingHours"),
      paymentMethods: strs(fd, "paymentMethods"),
      areas: strs(fd, "areas"),
    };
  }
  return { lgpdAccepted: fd.get("lgpdAccepted") === "on" };
}

/** Valores para reexibir o formulário depois de um erro (nada sensível além do que o dono digitou). */
export function readValues(fd: FormData): FormValues {
  const out: FormValues = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = fd.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = all.length > 1 || key === "areas" || key === "paymentMethods" ? all : (all[0] ?? "");
  }
  return out;
}

function issuesToErrors(issues: readonly { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/** Erros de um passo (vazio quando válido). */
export function validateStep(step: RegistrationStep, fd: FormData): FieldErrors {
  const parsed = STATIONERY_STEP_SCHEMAS[step].safeParse(readStep(step, fd));
  return parsed.success ? {} : issuesToErrors(parsed.error.issues);
}

export function validateRegistration(
  fd: FormData,
): { ok: true; data: StationeryRegistration } | { ok: false; errors: FieldErrors } {
  const basics = STATIONERY_STEP_SCHEMAS.basics.safeParse(readStep("basics", fd));
  const service = STATIONERY_STEP_SCHEMAS.service.safeParse(readStep("service", fd));
  const consent = STATIONERY_STEP_SCHEMAS.consent.safeParse(readStep("consent", fd));
  if (basics.success && service.success && consent.success) {
    return { ok: true, data: { basics: basics.data, service: service.data, consent: consent.data } };
  }
  return {
    ok: false,
    errors: {
      ...(consent.success ? {} : issuesToErrors(consent.error.issues)),
      ...(service.success ? {} : issuesToErrors(service.error.issues)),
      ...(basics.success ? {} : issuesToErrors(basics.error.issues)),
    },
  };
}

/** Passo do primeiro campo com erro (para o stepper voltar a ele). */
export function stepOfField(field: string): RegistrationStep {
  if (["tradeName", "legalName", "cnpj", "municipalityId", "neighborhood", "address", "cep"].includes(field)) return "basics";
  if (field === "lgpdAccepted") return "consent";
  return "service";
}

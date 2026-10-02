export type ActivationInput = {
  /** Perfil publicado (status `active`). */
  hasProfile: boolean;
  areasCount: number;
  catalogCount: number;
  leadsReceived: number;
};

export type ActivationStepId = "profile" | "areas" | "catalog" | "lead";

export type ActivationStep = { id: ActivationStepId; label: string; hint: string; href: string; done: boolean };

export type Activation = {
  steps: ActivationStep[];
  doneCount: number;
  complete: boolean;
  next: ActivationStep | null;
};

const positive = (n: number): boolean => Number.isFinite(n) && n > 0;

/** Passos até o primeiro lead, calculados só de dado real (nada de meta ou prazo prometido). */
export function computeActivation(input: ActivationInput): Activation {
  const steps: ActivationStep[] = [
    { id: "profile", label: "Publicar a papelaria", hint: "Só papelarias publicadas aparecem para os pais.", href: "/papelaria", done: input.hasProfile },
    { id: "areas", label: "Informar os bairros atendidos", hint: "Os pedidos chegam de quem mora nesses bairros.", href: "/papelaria/areas", done: positive(input.areasCount) },
    { id: "catalog", label: "Cadastrar o catálogo", hint: "Preço e estoque só aparecem se você informar.", href: "/papelaria/catalogo", done: positive(input.catalogCount) },
    { id: "lead", label: "Receber o primeiro pedido de cotação", hint: "Quando um responsável pedir, ele aparece em Leads.", href: "/papelaria/leads", done: positive(input.leadsReceived) },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, complete: doneCount === steps.length, next: steps.find((s) => !s.done) ?? null };
}

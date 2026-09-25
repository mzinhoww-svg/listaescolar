import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationList } from "@/components/notifications/NotificationList";
import { PreferencesForm } from "@/components/notifications/PreferencesForm";
import { PushOptIn } from "@/components/notifications/PushOptIn";
import { WatchButton } from "@/components/notifications/WatchButton";
import type { NotificationRow } from "@/features/notifications/queries-types";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

const row = (over: Partial<NotificationRow> = {}): NotificationRow => ({ id: "40000000-0000-4000-8000-0000000000a1", eventType: "submission_ready", params: { school_name: "Escola Modelo" }, linkPath: "/enviar-lista/abc", isDemo: false, readAt: null, createdAt: "2026-09-25T12:00:00Z", ...over });
const noop = vi.fn(async () => undefined);

describe("central: lista", () => {
  it("texto do catálogo como texto React (params hostis não viram HTML) e link relativo", () => {
    const { container } = render(<NotificationItem n={row({ params: { school_name: "<img src=x onerror=alert(1)>" } })} markRead={noop} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sua lista foi lida/ })).toHaveAttribute("href", "/enviar-lista/abc");
  });
  it("params fora da lista fechada não quebram a página nem aparecem", () => {
    render(<NotificationItem n={row({ params: { student_name: "Joana" } as never })} markRead={noop} />);
    expect(screen.queryByText(/Joana/)).toBeNull();
    expect(screen.getByText("Sua lista foi lida")).toBeInTheDocument();
  });
  it("link inseguro é descartado (sem href externo)", () => {
    render(<NotificationItem n={row({ linkPath: "https://evil.example/x" })} markRead={noop} />);
    expect(document.querySelector('a[href^="http"]')).toBeNull();
  });
  it("não lida: destaque textual e botão 'Marcar como lida'; lida: sem botão; selo Demonstração", () => {
    const { rerender } = render(<NotificationItem n={row({ isDemo: true })} markRead={noop} />);
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marcar como lida/ })).toBeInTheDocument();
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
    rerender(<NotificationItem n={row({ readAt: "2026-09-25T13:00:00Z" })} markRead={noop} />);
    expect(screen.queryByRole("button", { name: /Marcar como lida/ })).toBeNull();
    expect(screen.queryByText("Nova")).toBeNull();
  });
  it("vazio, 'Marcar todas' só com não lidas e paginação", () => {
    const { rerender } = render(<NotificationList items={[]} unread={0} page={1} pageCount={1} markRead={noop} markAllRead={noop} />);
    expect(screen.getByText("Nenhuma notificação por enquanto.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Marcar todas/ })).toBeNull();
    rerender(<NotificationList items={[row(), row({ id: "40000000-0000-4000-8000-0000000000a2" })]} unread={2} page={2} pageCount={3} markRead={noop} markAllRead={noop} />);
    expect(screen.getByRole("button", { name: /Marcar todas como lidas/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Anterior/ })).toHaveAttribute("href", "/conta/notificacoes?pagina=1");
    expect(screen.getByRole("link", { name: /Próxima/ })).toHaveAttribute("href", "/conta/notificacoes?pagina=3");
  });
});

describe("PreferencesForm", () => {
  it("evento x canal; e-mail indisponível fica desabilitado com o texto 'indisponível no momento'; web push sem VAPID idem", () => {
    render(<PreferencesForm prefs={[{ event_type: "lead_received", channel: "web_push", enabled: true }]} availability={{ web_push: true, email: false }} save={vi.fn(async () => ({ status: "ok" as const }))} />);
    const push = screen.getByRole("checkbox", { name: /Novo pedido de cotação.*navegador|navegador.*Você tem um novo pedido/i });
    expect(push).toBeChecked();
    const mail = screen.getAllByRole("checkbox", { name: /e-mail/i })[0]!;
    expect(mail).toBeDisabled();
    expect(screen.getAllByText("indisponível no momento").length).toBeGreaterThan(0);
  });
  it("marcar chama a action com evento, canal e novo valor e mostra a confirmação em role=status", async () => {
    const save = vi.fn(async () => ({ status: "ok" as const }));
    render(<PreferencesForm prefs={[]} availability={{ web_push: true, email: false }} save={save} />);
    fireEvent.click(screen.getAllByRole("checkbox", { name: /navegador/i })[0]!);
    await waitFor(() => expect(save).toHaveBeenCalledWith({ event: expect.any(String), channel: "web_push", enabled: true }));
    expect(await screen.findByRole("status")).toHaveTextContent(/salv/i);
  });
  it("erro da action volta o checkbox e avisa com role=alert", async () => {
    const save = vi.fn(async () => ({ status: "error" as const, code: "channel_unavailable" }));
    render(<PreferencesForm prefs={[]} availability={{ web_push: true, email: false }} save={save} />);
    const box = screen.getAllByRole("checkbox", { name: /navegador/i })[0]!;
    fireEvent.click(box);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(box).not.toBeChecked();
  });
});

describe("PushOptIn", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const setup = (permission: NotificationPermission) => {
    const request = vi.fn(async () => permission);
    const subscribe = vi.fn(async () => ({ toJSON: () => ({ endpoint: "https://push.example/1", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } }) }));
    vi.stubGlobal("Notification", Object.assign(function () {}, { requestPermission: request, permission: "default" }));
    vi.stubGlobal("PushManager", function () {});
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn(async () => ({ pushManager: { subscribe } })), ready: Promise.resolve({ pushManager: { subscribe } }) } });
    return { request, subscribe };
  };
  it("sem VAPID público: 'indisponível neste ambiente' e sem botão", () => {
    render(<PushOptIn publicKey={null} subscribe={vi.fn()} unsubscribe={vi.fn()} />);
    expect(screen.getByText(/indisponível neste ambiente/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ativar/ })).toBeNull();
  });
  it("NÃO pede permissão ao montar; só depois do clique", async () => {
    const { request } = setup("granted");
    render(<PushOptIn publicKey={"P".repeat(87)} subscribe={vi.fn(async () => ({ status: "ok" as const }))} unsubscribe={vi.fn()} />);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ativar neste navegador" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });
  it("permissão concedida: assina e envia à action; sucesso em role=status", async () => {
    const { subscribe } = setup("granted");
    const send = vi.fn(async () => ({ status: "ok" as const }));
    render(<PushOptIn publicKey={"P".repeat(87)} subscribe={send} unsubscribe={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ativar neste navegador" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({ endpoint: "https://push.example/1", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } }));
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(await screen.findByRole("status")).toHaveTextContent(/ativad/i);
  });
  it("permissão negada: mensagem e NADA gravado", async () => {
    setup("denied");
    const send = vi.fn();
    render(<PushOptIn publicKey={"P".repeat(87)} subscribe={send} unsubscribe={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ativar neste navegador" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/bloque|negad/i);
    expect(send).not.toHaveBeenCalled();
  });
  it("navegador sem suporte: aviso claro, sem botão", () => {
    vi.stubGlobal("Notification", undefined);
    render(<PushOptIn publicKey={"P".repeat(87)} subscribe={vi.fn()} unsubscribe={vi.fn()} />);
    expect(screen.getByText(/não oferece/i)).toBeInTheDocument();
  });
});

describe("WatchButton (App24 'Me avise')", () => {
  const base = { inep: "51000001", gradeSlug: "ef-4", year: 2027, watch: vi.fn(async () => ({ status: "ok" as const })), unwatch: vi.fn(async () => ({ status: "ok" as const })), pushAvailable: false };
  it("sem login: link para /entrar?next= (sem campo de telefone nem e-mail)", () => {
    render(<WatchButton {...base} loggedIn={false} watching={false} nextPath="/escolas/51000001/ef-4?ano=2027" />);
    expect(screen.getByRole("link", { name: "Me avise" })).toHaveAttribute("href", `/entrar?next=${encodeURIComponent("/escolas/51000001/ef-4?ano=2027")}`);
    expect(document.querySelector('input[type="tel"], input[type="email"]')).toBeNull();
  });
  it("com login: cria o watch e diz onde será avisado; WhatsApp e e-mail 'indisponível no momento'", async () => {
    render(<WatchButton {...base} loggedIn watching={false} nextPath="/x" />);
    fireEvent.click(screen.getByRole("button", { name: "Me avise" }));
    await waitFor(() => expect(base.watch).toHaveBeenCalledWith({ inep: "51000001", gradeSlug: "ef-4", year: 2027 }));
    expect(await screen.findByText(/Você será avisado aqui no app/)).toBeInTheDocument();
    expect(screen.getAllByText("indisponível no momento")).toHaveLength(2);
  });
  it("canal do navegador só aparece quando existe VAPID; erro de limite tem frase", async () => {
    const watch = vi.fn(async () => ({ status: "error" as const, code: "limit" }));
    render(<WatchButton {...base} watch={watch} loggedIn watching={false} pushAvailable nextPath="/x" />);
    expect(screen.getByText(/navegador/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Me avise" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/limite/i);
    void act;
  });
  it("já acompanhando: mostra o estado e permite parar", async () => {
    render(<WatchButton {...base} loggedIn watching nextPath="/x" />);
    expect(screen.getByText(/Você será avisado aqui no app/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Parar de avisar/ }));
    await waitFor(() => expect(base.unwatch).toHaveBeenCalled());
  });
});

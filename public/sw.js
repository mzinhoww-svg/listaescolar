// Service worker do Web Push (ListaCerta). Mostra só o título GENÉRICO recebido e guarda o caminho relativo para o clique.
// Nunca exibe a URL nem corpo com dados; nunca abre URL externa.
function safePath(u) {
  return typeof u === "string" && /^\/[A-Za-z0-9/_?=&.%-]*$/.test(u) && u.indexOf("//") === -1 ? u : "/";
}

self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (e) {
    payload = null;
    void e;
  }
  const title = payload && typeof payload.title === "string" && payload.title.length > 0 && payload.title.length <= 120 ? payload.title : "ListaCerta";
  const url = safePath(payload && payload.url);
  event.waitUntil(self.registration.showNotification(title, { data: { url }, tag: "listacerta" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  const target = new URL(safePath(data && data.url), self.location.origin).href;
  event.waitUntil(self.clients.openWindow(target));
});

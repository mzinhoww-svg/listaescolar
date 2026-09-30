// Widget embutível do ListaCerta (S25, B2B04). Sem cookies, sem dado do usuário, sem terceiro: só lê
// `data-partner-id`/`data-region` do próprio <script>, busca dados PÚBLICOS em /api/widget/** (mesmo domínio
// deste arquivo) e desenha DOM dentro de #listacerta-widget. O destino do carrinho SEMPRE vem da configuração do
// próprio parceiro (cartTargetDomain, devolvida por /api/widget/config): nunca aceita URL de fora (sem open
// redirect). Sem dependência externa; roda isolado (IIFE), nada global além do necessário.
(function () {
  "use strict";

  var CURRENT_SCRIPT = document.currentScript;
  if (!CURRENT_SCRIPT || !CURRENT_SCRIPT.src) return;
  var API_ORIGIN = new URL(CURRENT_SCRIPT.src).origin;
  var PARTNER_ID = CURRENT_SCRIPT.getAttribute("data-partner-id") || "";
  var MOUNT_ID = CURRENT_SCRIPT.getAttribute("data-mount-id") || "listacerta-widget";

  function api(path) {
    return API_ORIGIN + path;
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }

  function fetchJson(url) {
    return fetch(url, { method: "GET", credentials: "omit", mode: "cors" }).then(function (res) {
      if (!res.ok) throw new Error("http_" + res.status);
      return res.json();
    });
  }

  /** Hostname puro (validado no servidor): monta a URL do carrinho SEMPRE aqui, nunca a partir de dado externo. */
  function cartUrl(domain, items) {
    var params = new URLSearchParams();
    params.set("partner_id", PARTNER_ID);
    items.forEach(function (it, i) {
      params.set("item" + i, it.normalized_name + "|" + (it.quantity || 1));
    });
    return "https://" + domain + "/carrinho?" + params.toString();
  }

  var HEX = /^#[0-9A-Fa-f]{6}$/;
  var HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
  var CSS =
    ":host{all:initial;display:block;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0F1B2D}" +
    ".lc{box-sizing:border-box;max-width:420px;padding:16px;background:#F5F2EA;border:1px solid #d8d3c4;border-radius:12px}" +
    ".lc *{box-sizing:border-box;font:inherit}" +
    ".lc-h{font-size:14px;font-weight:600;margin:0 0 12px}" +
    ".lc input{width:100%;min-height:44px;padding:8px 12px;border:1px solid #6b7280;border-radius:8px;background:#fff;color:#0F1B2D}" +
    ".lc input:focus-visible,.lc button:focus-visible{outline:3px solid var(--listacerta-accent,#0B6B4A);outline-offset:2px}" +
    ".lc button{display:block;width:100%;min-height:44px;margin-top:8px;padding:8px 12px;text-align:left;cursor:pointer;border:1px solid #6b7280;border-radius:8px;background:#fff;color:#0F1B2D}" +
    ".lc button.lc-cart{text-align:center;font-weight:600;border-color:var(--listacerta-accent,#0B6B4A);background:var(--listacerta-accent,#0B6B4A);color:#fff}" +
    ".lc button:disabled{opacity:.6;cursor:not-allowed}" +
    ".lc-i{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #d8d3c4}" +
    ".lc-s{margin:8px 0 0;font-size:14px}";

  function applyStyle(root) {
    try {
      if (typeof CSSStyleSheet !== "undefined" && "adoptedStyleSheets" in root) {
        var sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        root.adoptedStyleSheets = [sheet];
        return;
      }
    } catch (e) {
      /* cai para <style> */
    }
    var st = document.createElement("style");
    st.textContent = CSS;
    root.appendChild(st);
  }

  function status(box, text) {
    box.textContent = "";
    if (!text) return;
    var p = el("p", { class: "lc-s", role: "status" }, [text]);
    box.appendChild(p);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
  }

  function render(host, config) {
    host.textContent = "";
    var mount = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    while (mount.firstChild) mount.removeChild(mount.firstChild);
    applyStyle(mount);
    var wrap = el("div", { class: "lc" }, []);
    mount.appendChild(wrap);
    if (typeof config.accentColor === "string" && HEX.test(config.accentColor)) host.style.setProperty("--listacerta-accent", config.accentColor);
    var cartDomain = typeof config.cartTargetDomain === "string" && HOST.test(config.cartTargetDomain) ? config.cartTargetDomain : "";

    var searchInput = el("input", { type: "search", placeholder: "Nome da escola", "aria-label": "Nome da escola" }, []);
    var resultsBox = el("div", { class: "lc-r", "aria-live": "polite" }, []);
    var itemsBox = el("div", { class: "lc-items" }, []);
    var cartButton = el("button", { type: "button", class: "lc-cart", disabled: "disabled" }, ["Adicionar tudo ao carrinho"]);
    cartButton.style.display = "none";

    var selectedItems = [];

    cartButton.addEventListener("click", function () {
      if (selectedItems.length === 0 || !cartDomain) return;
      window.open(cartUrl(cartDomain, selectedItems), "_blank", "noopener,noreferrer");
    });

    function showItems(items) {
      selectedItems = items;
      itemsBox.textContent = "";
      if (items.length === 0) {
        cartButton.style.display = "none";
        return;
      }
      items.forEach(function (it) {
        var row = el("div", { class: "lc-i" }, [
          el("span", {}, [it.name]),
          el("span", {}, [String(it.quantity || 1) + (it.unit ? " " + it.unit : "")]),
        ]);
        itemsBox.appendChild(row);
      });
      cartButton.style.display = "";
      cartButton.removeAttribute("disabled");
    }

    function pickList(listId) {
      fetchJson(api("/api/widget/lists/" + listId + "/items?partnerId=" + encodeURIComponent(PARTNER_ID)))
        .then(function (body) {
          showItems(body.data || []);
        })
        .catch(function () {
          showItems([]);
          status(resultsBox, "Não foi possível carregar os itens. Tente de novo.");
        });
    }

    function pickSchool(inep) {
      fetchJson(api("/api/widget/schools/" + inep + "/lists?partnerId=" + encodeURIComponent(PARTNER_ID)))
        .then(function (body) {
          resultsBox.textContent = "";
          if (!(body.data || []).length) status(resultsBox, "Esta escola ainda não tem lista disponível.");
          (body.data || []).forEach(function (l) {
            var btn = el("button", { type: "button", }, [l.grade.name + " · " + l.school_year]);
            btn.addEventListener("click", function () {
              pickList(l.id);
            });
            resultsBox.appendChild(btn);
          });
        })
        .catch(function () {
          status(resultsBox, "Não foi possível carregar as listas. Tente de novo.");
        });
    }

    var doSearch = debounce(function (q) {
      if (!q || q.length < 2) {
        resultsBox.textContent = "";
        return;
      }
      fetchJson(api("/api/widget/schools?partnerId=" + encodeURIComponent(PARTNER_ID) + "&q=" + encodeURIComponent(q)))
        .then(function (body) {
          resultsBox.textContent = "";
          if (!(body.data || []).length) status(resultsBox, "Nenhuma escola encontrada com esse nome.");
          (body.data || []).forEach(function (s) {
            var btn = el("button", { type: "button", }, [s.name]);
            btn.addEventListener("click", function () {
              searchInput.value = s.name;
              pickSchool(s.inep);
            });
            resultsBox.appendChild(btn);
          });
        })
        .catch(function () {
          status(resultsBox, "Não foi possível buscar agora. Tente de novo em instantes.");
        });
    }, 300);

    searchInput.addEventListener("input", function (ev) {
      doSearch(ev.target.value);
    });

    wrap.appendChild(el("p", { class: "lc-h" }, ["Lista escolar · por ListaCerta"]));
    wrap.appendChild(searchInput);
    wrap.appendChild(resultsBox);
    wrap.appendChild(itemsBox);
    wrap.appendChild(cartButton);
  }

  function init() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount || !PARTNER_ID) return;
    fetchJson(api("/api/widget/config?partnerId=" + encodeURIComponent(PARTNER_ID)))
      .then(function (body) {
        render(mount, body.data);
      })
      .catch(function () {
        mount.textContent = "";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

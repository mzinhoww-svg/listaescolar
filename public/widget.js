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

  function render(mount, config) {
    mount.textContent = "";
    if (config.accentColor) mount.style.setProperty("--listacerta-accent", config.accentColor);

    var searchInput = el("input", { type: "search", placeholder: "Nome da escola", "aria-label": "Nome da escola" }, []);
    var resultsBox = el("div", { class: "listacerta-widget-results" }, []);
    var itemsBox = el("div", { class: "listacerta-widget-items" }, []);
    var cartButton = el("button", { type: "button", disabled: "disabled" }, ["Adicionar tudo ao carrinho"]);
    cartButton.style.display = "none";

    var selectedItems = [];

    cartButton.addEventListener("click", function () {
      if (selectedItems.length === 0) return;
      window.open(cartUrl(config.cartTargetDomain, selectedItems), "_blank", "noopener,noreferrer");
    });

    function showItems(items) {
      selectedItems = items;
      itemsBox.textContent = "";
      if (items.length === 0) {
        cartButton.style.display = "none";
        return;
      }
      items.forEach(function (it) {
        var row = el("div", { class: "listacerta-widget-item" }, [
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
        });
    }

    function pickSchool(inep) {
      fetchJson(api("/api/widget/schools/" + inep + "/lists?partnerId=" + encodeURIComponent(PARTNER_ID)))
        .then(function (body) {
          resultsBox.textContent = "";
          (body.data || []).forEach(function (l) {
            var btn = el("button", { type: "button", class: "listacerta-widget-list-btn" }, [l.grade.name + " · " + l.school_year]);
            btn.addEventListener("click", function () {
              pickList(l.id);
            });
            resultsBox.appendChild(btn);
          });
        })
        .catch(function () {
          resultsBox.textContent = "";
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
          (body.data || []).forEach(function (s) {
            var btn = el("button", { type: "button", class: "listacerta-widget-school-btn" }, [s.name]);
            btn.addEventListener("click", function () {
              searchInput.value = s.name;
              pickSchool(s.inep);
            });
            resultsBox.appendChild(btn);
          });
        })
        .catch(function () {
          resultsBox.textContent = "";
        });
    }, 300);

    searchInput.addEventListener("input", function (ev) {
      doSearch(ev.target.value);
    });

    mount.appendChild(el("div", { class: "listacerta-widget-header" }, ["Lista escolar · por listacerta"]));
    mount.appendChild(searchInput);
    mount.appendChild(resultsBox);
    mount.appendChild(itemsBox);
    mount.appendChild(cartButton);
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

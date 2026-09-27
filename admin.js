/* Painel interno da galeria de validação de produtos (somente leitura, chave admin). */
(async function () {
  const qs = new URLSearchParams(location.search);
  const SLUG = (qs.get("c") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const KEY = qs.get("k") || "";
  const API = (location.hostname === "127.0.0.1" && qs.get("api")) || VP_CONFIG.apiBase;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const seed = await (await fetch(`clients/${SLUG}.json?v=${Date.now()}`)).json();
  const resp = await fetch(`${API}?action=get&slug=${SLUG}&k=${encodeURIComponent(KEY)}&t=${Date.now()}`);
  if (!resp.ok) { document.getElementById("sub").textContent = "Acesso negado: use o link com a chave de admin."; return; }
  const st = await resp.json();
  const items = st.items || {};
  const gnome = Object.fromEntries(seed.grupos.map((g) => [g.id, g.nome]));
  const it = (p) => items[p.id] || { decisao: "", qtd: {}, obs: "" };
  const tot = (p) => Object.values(it(p).qtd || {}).reduce((a, b) => a + (+b || 0), 0);
  const temQtd = (p) => Object.keys(it(p).qtd || {}).length > 0;
  document.title = "Resultado · " + seed.cliente;
  document.getElementById("h").textContent = "Resultado da revisão · " + seed.cliente;
  document.getElementById("sub").textContent =
    (st.reviewer ? "Revisado por " + st.reviewer + " · " : "") +
    (st.finished ? "Enviado em " + new Date(st.finished.at).toLocaleString("pt-BR") : "Ainda não clicou em Terminei");

  const P = seed.produtos;
  const m = P.filter((p) => it(p).decisao === "manter"), r = P.filter((p) => it(p).decisao === "remover");
  const k = [["Produtos", P.length], ["Manter", m.length], ["Remover", r.length], ["Falta revisar", P.length - m.length - r.length],
    ["Peças em estoque (manter)", m.reduce((a, p) => a + tot(p), 0)], ["Manter sem quantidade", m.filter((p) => !temQtd(p)).length]];
  document.getElementById("kpis").innerHTML = k.map(([n, v]) => `<div class="kpi"><b>${v}</b><span>${n}</span></div>`).join("");

  let f = "todos";
  const tools = document.getElementById("tools");
  const draw = () => {
    tools.innerHTML = [["todos", "Todos"], ["manter", "Manter"], ["remover", "Remover"], ["pend", "Falta revisar"], ["obs", "Com observação"]]
      .map(([k, n]) => `<button class="chip ${k === f ? "on" : ""}" data-f="${k}">${n}</button>`).join("") +
      `<span class="sep"></span><button class="chip" id="csv">Baixar CSV pro Shopify</button>`;
    tools.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { f = b.dataset.f; draw(); }));
    document.getElementById("csv").onclick = csv;
    const lista = P.filter((p) => {
      const d = it(p).decisao;
      return f === "todos" || (f === "pend" ? !d : f === "obs" ? !!it(p).obs : d === f);
    });
    document.getElementById("tb").innerHTML = lista.map((p) => {
      const d = it(p).decisao, q = it(p).qtd || {};
      const vs = p.variante_unica ? "" : p.variantes.filter((v) => q[v.id] != null).map((v) => `${esc(v.nome)}: <b>${q[v.id]}</b>`).join(" · ");
      return `<tr><td><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(p.fotos[0])}" alt=""></a></td>
        <td><b>${esc(p.titulo)}</b><div class="var">$${p.preco.toFixed(2)} · ${esc(p.handle)}</div></td>
        <td>${esc(gnome[p.grupo] || "")}</td>
        <td><span class="pill ${d || "pend"}">${d === "manter" ? "Manter" : d === "remover" ? "Remover" : "Falta revisar"}</span></td>
        <td>${temQtd(p) ? tot(p) : "<span class='var'>não informado</span>"}</td>
        <td class="var">${vs}</td><td>${esc(it(p).obs || "")}</td></tr>`;
    }).join("");
  };
  function csv() {
    const rows = [["handle", "produto", "grupo", "decisao", "variante_id", "variante", "quantidade", "observacao", "url"]];
    P.forEach((p) => {
      const x = it(p);
      p.variantes.forEach((v) => rows.push([p.handle, p.titulo, gnome[p.grupo], x.decisao || "pendente", v.id, v.nome,
        (x.qtd || {})[v.id] ?? "", x.obs || "", p.url]));
    });
    const txt = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv" }));
    a.download = `revisao-produtos-${SLUG}.csv`; a.click();
  }
  draw();
})();

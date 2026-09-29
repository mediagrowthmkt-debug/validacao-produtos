/* Painel interno da curadoria (somente leitura, chave admin): lista o que o cliente escolheu vender + CSV. */
(async function () {
  const qs = new URLSearchParams(location.search);
  const SLUG = (qs.get("c") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const KEY = qs.get("k") || "";
  const API = (location.hostname === "127.0.0.1" && qs.get("api")) || VP_CONFIG.apiBase;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n) => "US$ " + Number(n || 0).toFixed(2);
  const seed = await (await fetch(`clients/${SLUG}.json?v=${Date.now()}`)).json();
  const resp = await fetch(`${API}?action=get&slug=${SLUG}&k=${encodeURIComponent(KEY)}&t=${Date.now()}`);
  if (!resp.ok) { document.getElementById("sub").textContent = "Acesso negado: use o link com a chave de admin."; return; }
  const st = await resp.json();
  const items = st.items || {};
  const it = (p) => items[p.id] || { decisao: "", obs: "" };
  document.title = "Curadoria · " + seed.cliente;
  document.getElementById("h").textContent = "Resultado da curadoria · " + seed.cliente;
  document.getElementById("sub").textContent = (st.reviewer ? "Escolhido por " + st.reviewer + " · " : "") +
    (st.finished ? "Enviado em " + new Date(st.finished.at).toLocaleString("pt-BR") : "Ainda não clicou em Terminei");
  const P = seed.produtos;
  const v = P.filter((p) => it(p).decisao === "manter"), n = P.filter((p) => it(p).decisao === "remover");
  const med = v.length ? v.reduce((a, p) => a + p.margem_pct, 0) / v.length : 0;
  const k = [["Produtos", P.length], ["Vender", v.length], ["Não vender", n.length], ["Falta decidir", P.length - v.length - n.length],
    ["Margem média (vender)", med.toFixed(0) + "%"], ["Com observação", P.filter((p) => it(p).obs).length]];
  document.getElementById("kpis").innerHTML = k.map(([a, b]) => `<div class="kpi"><b>${b}</b><span>${a}</span></div>`).join("");
  let f = "manter";
  const tools = document.getElementById("tools");
  const L = { manter: "Vender", remover: "Não vender" };
  const draw = () => {
    tools.innerHTML = [["manter", "Vender"], ["remover", "Não vender"], ["pend", "Falta decidir"], ["obs", "Com observação"], ["todos", "Todos"]]
      .map(([a, b]) => `<button class="chip ${a === f ? "on" : ""}" data-f="${a}">${b}</button>`).join("") +
      `<span class="sep"></span><button class="chip" id="csv">Baixar CSV dos escolhidos</button>`;
    tools.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { f = b.dataset.f; draw(); }));
    document.getElementById("csv").onclick = csv;
    const lista = P.filter((p) => { const d = it(p).decisao; return f === "todos" || (f === "pend" ? !d : f === "obs" ? !!it(p).obs : d === f); });
    document.getElementById("tb").innerHTML = lista.map((p) => { const d = it(p).decisao;
      return `<tr><td><img src="${esc(p.fotos[0])}" alt=""></td><td><b>${esc(p.titulo)}</b><div class="var">${esc(p.fornecedor)} · código ${esc(p.id)} · ${esc(p.estilo || "")}</div></td>
      <td>${esc(p.tipo)}</td><td><span class="pill ${d || "pend"}">${L[d] || "Falta decidir"}</span></td>
      <td>${usd(p.custo_total)}</td><td>${usd(p.preco_sugerido)}</td><td>${usd(p.lucro)} (${p.margem_pct.toFixed(0)}%)</td><td>${esc(it(p).obs || "")}</td></tr>`; }).join("");
  };
  function csv() {
    const rows = [["decisao", "fornecedor", "codigo_fornecedor", "produto", "tipo", "estilo", "comodo", "custo_produto", "frete", "custo_total", "preco_sugerido", "lucro", "margem_pct", "observacao", "url_fornecedor"]];
    P.forEach((p) => { const x = it(p); rows.push([L[x.decisao] || "falta decidir", p.fornecedor, p.id, p.titulo, p.tipo, p.estilo, p.comodo,
      p.custo_produto, p.frete, p.custo_total, p.preco_sugerido, p.lucro, p.margem_pct, x.obs || "", p.url_fornecedor]); });
    const txt = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv" }));
    a.download = `curadoria-${SLUG}.csv`; a.click();
  }
  draw();
})();

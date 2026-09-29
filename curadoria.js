/* Curadoria de produtos de uma loja nova (MediaGrowth).
 * O cliente vê os produtos candidatos do fornecedor com custo, preço sugerido e margem, e marca Vender / Não vender.
 * Mesmo backend da galeria de validação: decisão "manter" = vender, "remover" = não vender. */
(function () {
  const qs = new URLSearchParams(location.search);
  const SLUG = (qs.get("c") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const KEY = qs.get("k") || "";
  const API = (location.hostname === "127.0.0.1" && qs.get("api")) || window.VP_CONFIG.apiBase;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n) => "US$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const L = { manter: "Vender", remover: "Não vender", "": "Falta decidir" };

  let seed = null, state = { items: {}, reviewer: "", finished: null };
  let grupo = "todos", filtro = "todos", busca = "", ordem = "padrao";
  const timers = {};

  const who = () => $("who").value.trim();
  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  async function post(data) {
    const r = await fetch(API, { method: "POST", body: new URLSearchParams(Object.assign({ slug: SLUG, k: KEY }, data)) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  const item = (pid) => state.items[pid] || { decisao: "", qtd: {}, obs: "" };

  /* ---------- guia ---------- */
  function renderGuia() {
    const g = seed.guia || {};
    const bloco = (b) => `<details class="gbox" ${b.aberto ? "open" : ""}><summary>${esc(b.titulo)}</summary><div class="gbody">` +
      (b.texto ? `<p>${esc(b.texto)}</p>` : "") +
      (b.itens ? `<ul>${b.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "") +
      (b.tabela ? `<div class="tscroll"><table><thead><tr>${b.tabela.cab.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
        b.tabela.linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") + `</tbody></table></div>` : "") +
      (b.nota ? `<p class="gnote">${esc(b.nota)}</p>` : "") + `</div></details>`;
    $("guia").innerHTML = `<h2>${esc(g.titulo || "Tudo que vocês precisam saber pra abrir a loja")}</h2>` +
      (g.kpis ? `<div class="gkpis">${g.kpis.map((k) => `<div><b>${esc(k.valor)}</b><span>${esc(k.nome)}</span></div>`).join("")}</div>` : "") +
      (g.blocos || []).map(bloco).join("");
  }

  /* ---------- carregar ---------- */
  async function init() {
    if (!SLUG || !KEY) { $("grid").innerHTML = '<div class="empty">Link incompleto. Abra pelo link que a MediaGrowth enviou.</div>'; return; }
    try { seed = await (await fetch(`clients/${SLUG}.json?v=${Date.now()}`)).json(); }
    catch (e) { $("grid").innerHTML = '<div class="empty">Não encontramos esta curadoria.</div>'; return; }
    document.title = `Escolha dos produtos · ${seed.cliente}`;
    if (seed.logo) { $("logo").src = seed.logo; $("logo").alt = seed.cliente; $("logo").hidden = false; }
    if (seed.cor) document.documentElement.style.setProperty("--brand", seed.cor);
    $("kicker").textContent = seed.kicker || seed.cliente;
    if (seed.titulo) $("h1").textContent = seed.titulo;
    $("lead").textContent = seed.lead || "";
    renderGuia();
    try {
      const r = await fetch(`${API}?action=get&slug=${SLUG}&k=${encodeURIComponent(KEY)}&t=${Date.now()}`);
      if (r.status === 403) { $("grid").innerHTML = '<div class="empty">Link inválido ou expirado. Peça um novo link à MediaGrowth.</div>'; return; }
      const st = await r.json();
      if (st && st.items) state = st;
    } catch (e) { $("grid").innerHTML = '<div class="empty">Sem conexão com o servidor. Tente de novo em instantes.</div>'; return; }
    $("who").value = lsGet("vp_who_" + SLUG) || state.reviewer || "";
    $("who").addEventListener("change", () => lsSet("vp_who_" + SLUG, who()));
    renderGroups(); renderFilters(); renderGrid(); progress();
    if (state.finished) $("donemsg").textContent = "Escolha enviada. Pode continuar ajustando se quiser.";
  }

  /* ---------- barra ---------- */
  function renderGroups() {
    const cont = { todos: seed.produtos.length };
    seed.produtos.forEach((p) => (cont[p.grupo] = (cont[p.grupo] || 0) + 1));
    const gs = [{ id: "todos", nome: "Todos" }].concat(seed.grupos.filter((g) => cont[g.id]));
    $("groups").innerHTML = gs.map((g) => `<button class="chip ${g.id === grupo ? "on" : ""}" data-g="${g.id}">${esc(g.nome)}<small>${cont[g.id]}</small></button>`).join("");
    $("groups").querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => { grupo = b.dataset.g; renderGroups(); renderGrid(); }));
  }
  function renderFilters() {
    const fs = [["todos", "Todos"], ["pendentes", "Falta decidir"], ["manter", "Vender"], ["remover", "Não vender"]];
    $("filters").innerHTML = fs.map(([k, n]) => `<button class="chip ${k === filtro ? "on" : ""}" data-f="${k}">${n}</button>`).join("") +
      `<select class="search sel" id="ord"><option value="padrao">Ordem: recomendados</option><option value="preco">Menor preço</option><option value="preco-">Maior preço</option><option value="margem">Maior margem</option></select>` +
      `<input class="search" id="q" placeholder="Buscar produto" value="${esc(busca)}">`;
    $("filters").querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { filtro = b.dataset.f; renderFilters(); renderGrid(); }));
    $("ord").value = ordem; $("ord").onchange = (e) => { ordem = e.target.value; renderGrid(); };
    $("q").oninput = (e) => { busca = e.target.value.toLowerCase(); renderGrid(); };
  }
  function progress() {
    const P = seed.produtos, n = P.length;
    const v = P.filter((p) => item(p.id).decisao === "manter");
    const feitos = P.filter((p) => item(p.id).decisao).length;
    const mMed = v.length ? v.reduce((a, p) => a + p.margem_pct, 0) / v.length : 0;
    $("fill").style.width = (100 * feitos / n) + "%";
    $("ptxt").innerHTML = `<b>${feitos} de ${n}</b> decididos · <b>${v.length}</b> pra vender` + (v.length ? ` · margem média ${mMed.toFixed(0)}%` : "");
  }

  /* ---------- cards ---------- */
  function visivel(p) {
    if (grupo !== "todos" && p.grupo !== grupo) return false;
    const d = item(p.id).decisao;
    if (filtro === "pendentes" && d) return false;
    if ((filtro === "manter" || filtro === "remover") && d !== filtro) return false;
    if (busca && !(p.titulo + " " + (p.estilo || "") + " " + (p.comodo || "")).toLowerCase().includes(busca)) return false;
    return true;
  }
  function ordenar(l) {
    const c = l.slice();
    if (ordem === "preco") c.sort((a, b) => a.preco_sugerido - b.preco_sugerido);
    if (ordem === "preco-") c.sort((a, b) => b.preco_sugerido - a.preco_sugerido);
    if (ordem === "margem") c.sort((a, b) => b.margem_pct - a.margem_pct);
    return c;
  }
  function renderGrid() {
    const lista = ordenar(seed.produtos.filter(visivel));
    $("grid").innerHTML = lista.length ? lista.map(cardHTML).join("") : '<div class="empty">Nenhum produto neste filtro.</div>';
    lista.forEach(bind);
  }
  function cardHTML(p) {
    const it = item(p.id), d = it.decisao;
    const tags = [p.tipo, p.estilo, p.comodo].filter(Boolean).map((t) => `<span class="ptag">${esc(t)}</span>`).join("");
    return `<article class="card ${d}" id="c${p.id}">
      <div class="photo" data-zoom>
        <img loading="lazy" src="${esc(p.fotos[0] || "")}" alt="${esc(p.titulo)}">
        ${p.fotos.length > 1 ? `<span class="n">${p.fotos.length} fotos</span>` : ""}
        <span class="tag ${d}">${L[d || ""]}</span>
        ${p.selo ? `<span class="selo">${esc(p.selo)}</span>` : ""}
      </div>
      <div class="body">
        <div><p class="title">${esc(p.titulo)}</p><div class="ptags">${tags}</div></div>
        <div class="nums">
          <div class="big"><span>Preço de venda sugerido</span><b>${usd(p.preco_sugerido)}</b></div>
          <div><span>Custo pra loja</span><b>${usd(p.custo_total)}</b></div>
          <div><span>Lucro por venda (${p.margem_pct.toFixed(0)}%)</span><b class="ok">${usd(p.lucro)}</b></div>
        </div>
        ${p.onde && p.onde.length ? `<div class="onde"><span>No site:</span> ${p.onde.map(esc).join(" · ")}</div>` : ""}
        <div class="mini">${esc(p.resumo_envio || "")}</div>
        <div class="dec"><button class="m ${d === "manter" ? "on" : ""}" data-d="manter">Vender</button><button class="r ${d === "remover" ? "on" : ""}" data-d="remover">Não vender</button></div>
        ${it.obs ? "" : `<button class="obs-t" data-obs>+ Observação</button>`}
        <textarea data-note placeholder="Observação (opcional)" style="${it.obs ? "" : "display:none"}">${esc(it.obs || "")}</textarea>
        <div class="saved" data-s></div>
      </div>
    </article>`;
  }
  function bind(p) {
    const el = $("c" + p.id);
    el.querySelector("[data-zoom]").onclick = () => openLB(p);
    el.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => {
      const it = read(p, el);
      it.decisao = it.decisao === b.dataset.d ? "" : b.dataset.d;
      setDec(el, it.decisao); save(p, it, 0);
    }));
    const note = el.querySelector("[data-note]");
    note.oninput = () => save(p, read(p, el), 900);
    const ob = el.querySelector("[data-obs]");
    if (ob) ob.onclick = () => { note.style.display = ""; ob.remove(); note.focus(); };
  }
  const read = (p, el) => ({ decisao: item(p.id).decisao || "", qtd: {}, obs: el.querySelector("[data-note]").value.trim() });
  function setDec(el, d) {
    el.className = "card " + d;
    el.querySelector("[data-d=manter]").classList.toggle("on", d === "manter");
    el.querySelector("[data-d=remover]").classList.toggle("on", d === "remover");
    const tag = el.querySelector(".tag"); tag.className = "tag " + d; tag.textContent = L[d || ""];
  }
  function save(p, it, delay) {
    state.items[p.id] = Object.assign({}, it);
    progress();
    const s = $("c" + p.id) && $("c" + p.id).querySelector("[data-s]");
    if (s) { s.className = "saved"; s.textContent = "Salvando…"; }
    clearTimeout(timers[p.id]);
    timers[p.id] = setTimeout(async () => {
      if (who()) lsSet("vp_who_" + SLUG, who());
      try {
        await post({ action: "save", pid: p.id, decisao: it.decisao, qtd: "{}", obs: it.obs, by: who() });
        if (s) { s.className = "saved ok"; s.textContent = "Salvo ✓"; }
      } catch (e) { if (s) { s.className = "saved err"; s.textContent = "Não salvou. Verifique a internet e toque de novo."; } }
    }, delay);
  }

  /* ---------- lightbox ---------- */
  function openLB(p) {
    const fotos = p.foto_grande && p.foto_grande.length ? p.foto_grande : p.fotos;
    const show = (i) => { $("lbimg").src = fotos[i]; $("lbthumbs").querySelectorAll("img").forEach((t, j) => t.classList.toggle("on", i === j)); };
    $("lbthumbs").innerHTML = fotos.length > 1 ? p.fotos.map((f, i) => `<img src="${esc(f)}" data-i="${i}" alt="">`).join("") : "";
    $("lbthumbs").querySelectorAll("img").forEach((t) => (t.onclick = () => show(+t.dataset.i)));
    const linhas = (p.ficha || []).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
    const contas = (p.conta || []).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
    $("lbinfo").innerHTML = `<h3>${esc(p.titulo)}</h3>` +
      (p.porque ? `<p class="why">${esc(p.porque)}</p>` : "") +
      `<h4>Números</h4><table class="ficha">${contas}</table>` +
      `<h4>Ficha do produto</h4><table class="ficha">${linhas}</table>` +
      (p.bullets && p.bullets.length ? `<h4>Destaques do fabricante</h4><ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "");
    show(0);
    $("lb").classList.add("open");
  }
  $("lbx").onclick = () => $("lb").classList.remove("open");
  $("lb").onclick = (e) => { if (e.target.id === "lb") $("lb").classList.remove("open"); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("lb").classList.remove("open"); });

  /* ---------- terminar ---------- */
  $("done").onclick = async () => {
    const falta = seed.produtos.filter((p) => !item(p.id).decisao).length;
    if (falta && !confirm(`Ainda faltam ${falta} produtos sem marcar Vender ou Não vender. Quer enviar assim mesmo?`)) return;
    $("done").disabled = true;
    try {
      await post({ action: "finish", by: who() });
      $("donemsg").className = "saved ok"; $("donemsg").textContent = "Recebido! A equipe da MediaGrowth já pode cadastrar os produtos escolhidos.";
    } catch (e) { $("donemsg").className = "saved err"; $("donemsg").textContent = "Não conseguimos enviar. Tente de novo."; }
    $("done").disabled = false;
  };

  init();
})();

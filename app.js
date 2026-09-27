/* Galeria de validação de produtos (MediaGrowth).
 * Lê o seed da loja (clients/<slug>.json) e sincroniza as respostas no backend por slug. */
(function () {
  const qs = new URLSearchParams(location.search);
  const SLUG = (qs.get("c") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const KEY = qs.get("k") || "";
  const API = (location.hostname === "127.0.0.1" && qs.get("api")) || window.VP_CONFIG.apiBase;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n || 0).toFixed(2);

  let seed = null, state = { items: {}, reviewer: "", finished: null };
  let grupo = "todos", filtro = "todos", busca = "";
  const timers = {};
  const byId = {};

  const who = () => $("who").value.trim();
  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  async function post(data) {
    const body = new URLSearchParams(Object.assign({ slug: SLUG, k: KEY }, data));
    const r = await fetch(API, { method: "POST", body });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function item(pid) { return state.items[pid] || { decisao: "", qtd: {}, obs: "" }; }
  function total(it) { return Object.values(it.qtd || {}).reduce((a, b) => a + (Number(b) || 0), 0); }

  /* ---------- carregar ---------- */
  async function init() {
    if (!SLUG || !KEY) { $("grid").innerHTML = '<div class="empty">Link incompleto. Abra pelo link que a MediaGrowth enviou.</div>'; return; }
    try {
      seed = await (await fetch(`clients/${SLUG}.json?v=${Date.now()}`)).json();
    } catch (e) { $("grid").innerHTML = '<div class="empty">Não encontramos esta loja.</div>'; return; }
    seed.produtos.forEach((p) => (byId[p.id] = p));
    document.title = `Revisão dos produtos · ${seed.cliente}`;
    $("logo").src = seed.logo; $("logo").alt = seed.cliente;
    if (seed.cor) document.documentElement.style.setProperty("--brand", seed.cor);
    try {
      const r = await fetch(`${API}?action=get&slug=${SLUG}&k=${encodeURIComponent(KEY)}&t=${Date.now()}`);
      if (r.status === 403) { $("grid").innerHTML = '<div class="empty">Link inválido ou expirado. Peça um novo link à MediaGrowth.</div>'; return; }
      const st = await r.json();
      if (st && st.items) state = st;
    } catch (e) { $("grid").innerHTML = '<div class="empty">Sem conexão com o servidor. Tente de novo em instantes.</div>'; return; }
    $("who").value = lsGet("vp_who_" + SLUG) || state.reviewer || "";
    $("who").addEventListener("change", () => lsSet("vp_who_" + SLUG, who()));
    renderGroups(); renderFilters(); renderGrid(); progress();
    if (state.finished) $("donemsg").textContent = "Revisão enviada. Pode continuar ajustando se quiser.";
  }

  /* ---------- barra ---------- */
  function renderGroups() {
    const cont = { todos: seed.produtos.length };
    seed.produtos.forEach((p) => (cont[p.grupo] = (cont[p.grupo] || 0) + 1));
    const gs = [{ id: "todos", nome: "Todos" }].concat(seed.grupos.filter((g) => cont[g.id]));
    $("groups").innerHTML = gs.map((g) =>
      `<button class="chip ${g.id === grupo ? "on" : ""}" data-g="${g.id}">${esc(g.nome)}<small>${cont[g.id]}</small></button>`).join("");
    $("groups").querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => { grupo = b.dataset.g; renderGroups(); renderGrid(); }));
  }
  function renderFilters() {
    const fs = [["todos", "Todos"], ["pendentes", "Falta revisar"], ["manter", "Manter"], ["remover", "Remover"]];
    $("filters").innerHTML = fs.map(([k, n]) => `<button class="chip ${k === filtro ? "on" : ""}" data-f="${k}">${n}</button>`).join("") +
      `<input class="search" id="q" placeholder="Buscar produto" value="${esc(busca)}">`;
    $("filters").querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { filtro = b.dataset.f; renderFilters(); renderGrid(); }));
    $("q").oninput = (e) => { busca = e.target.value.toLowerCase(); renderGrid(); };
  }
  function progress() {
    const n = seed.produtos.length;
    const feitos = seed.produtos.filter((p) => item(p.id).decisao).length;
    const m = seed.produtos.filter((p) => item(p.id).decisao === "manter").length;
    $("fill").style.width = (100 * feitos / n) + "%";
    $("ptxt").innerHTML = `<b>${feitos} de ${n}</b> revisados · ${m} manter · ${feitos - m} remover`;
  }

  /* ---------- cards ---------- */
  function visivel(p) {
    if (grupo !== "todos" && p.grupo !== grupo) return false;
    const d = item(p.id).decisao;
    if (filtro === "pendentes" && d) return false;
    if (filtro === "manter" && d !== "manter") return false;
    if (filtro === "remover" && d !== "remover") return false;
    if (busca && !p.titulo.toLowerCase().includes(busca)) return false;
    return true;
  }
  function renderGrid() {
    const lista = seed.produtos.filter(visivel);
    $("grid").innerHTML = lista.length ? lista.map(cardHTML).join("") : '<div class="empty">Nenhum produto neste filtro.</div>';
    lista.forEach((p) => bind(p));
  }
  function cardHTML(p) {
    const it = item(p.id);
    const d = it.decisao;
    const promo = p.preco_de && p.preco_de > p.preco ? ` <s>${money(p.preco_de)}</s> <span class="off">promoção</span>` : "";
    const esgot = (p.disponivel ? "" : ` · <span class="off">esgotado no site</span>`) +
      (p.variante_unica && p.variantes[0].nome !== "Único" ? ` · ${esc(p.variantes[0].nome)}` : "");
    const qs = p.variantes.map((v) =>
      `<label class="q"><span title="${esc(v.nome)}">${p.variante_unica ? "Peças em estoque" : esc(v.nome)}</span>` +
      `<input type="number" inputmode="numeric" min="0" step="1" data-v="${v.id}" value="${it.qtd && it.qtd[v.id] != null ? it.qtd[v.id] : ""}" placeholder="${p.variante_unica ? "Digite a quantidade" : "qtd"}"></label>`).join("");
    return `<article class="card ${d}" id="c${p.id}">
      <div class="photo" data-zoom>
        <img loading="lazy" src="${esc(p.fotos[0] || "")}" alt="${esc(p.titulo)}">
        ${p.fotos.length > 1 ? `<span class="n">${p.fotos.length} fotos</span>` : ""}
        <span class="tag ${d}">${d === "manter" ? "Manter" : d === "remover" ? "Remover" : "Falta revisar"}</span>
      </div>
      <div class="body">
        <div><p class="title">${esc(p.titulo)}</p><div class="meta">${money(p.preco)}${promo}${esgot}</div></div>
        <div class="dec"><button class="m ${d === "manter" ? "on" : ""}" data-d="manter">Manter</button><button class="r ${d === "remover" ? "on" : ""}" data-d="remover">Remover</button></div>
        <div>
          <div class="qlabel"><span>${p.variante_unica ? "Quantidade em estoque" : "Quantidade por tamanho/cor"}</span><button data-zero>Não tenho mais</button></div>
          <div class="qty ${p.variante_unica ? "one" : ""}">${qs}</div>
        </div>
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
      setDec(p, el, it.decisao); save(p, it, 0);
    }));
    el.querySelector("[data-zero]").onclick = () => {
      el.querySelectorAll("[data-v]").forEach((i) => (i.value = "0"));
      const it = read(p, el);
      if (!it.decisao) { it.decisao = "remover"; setDec(p, el, "remover"); }
      save(p, it, 0);
    };
    el.querySelectorAll("[data-v]").forEach((i) => (i.oninput = () => save(p, read(p, el), 700)));
    const note = el.querySelector("[data-note]");
    note.oninput = () => save(p, read(p, el), 900);
    const ob = el.querySelector("[data-obs]");
    if (ob) ob.onclick = () => { note.style.display = ""; ob.remove(); note.focus(); };
  }
  function read(p, el) {
    const qtd = {};
    el.querySelectorAll("[data-v]").forEach((i) => { if (i.value !== "") qtd[i.dataset.v] = Math.max(0, parseInt(i.value, 10) || 0); });
    return { decisao: item(p.id).decisao || "", qtd, obs: el.querySelector("[data-note]").value.trim() };
  }
  function setDec(p, el, d) {
    el.className = "card " + d;
    el.querySelector("[data-d=manter]").classList.toggle("on", d === "manter");
    el.querySelector("[data-d=remover]").classList.toggle("on", d === "remover");
    const tag = el.querySelector(".tag");
    tag.className = "tag " + d; tag.textContent = d === "manter" ? "Manter" : d === "remover" ? "Remover" : "Falta revisar";
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
        await post({ action: "save", pid: p.id, decisao: it.decisao, qtd: JSON.stringify(it.qtd), obs: it.obs, by: who() });
        if (s) { s.className = "saved ok"; s.textContent = "Salvo ✓"; }
      } catch (e) {
        if (s) { s.className = "saved err"; s.textContent = "Não salvou. Verifique a internet e toque de novo."; }
      }
    }, delay);
  }

  /* ---------- lightbox ---------- */
  function openLB(p) {
    const fotos = p.foto_grande.length ? p.foto_grande : p.fotos;
    const show = (i) => {
      $("lbimg").src = fotos[i];
      $("lbthumbs").querySelectorAll("img").forEach((t, j) => t.classList.toggle("on", i === j));
    };
    $("lbthumbs").innerHTML = fotos.length > 1 ? p.fotos.map((f, i) => `<img src="${esc(f)}" data-i="${i}" alt="">`).join("") : "";
    $("lbthumbs").querySelectorAll("img").forEach((t) => (t.onclick = () => show(+t.dataset.i)));
    const vs = p.variante_unica ? "" : `<p><strong>Tamanhos/cores no site:</strong> ${p.variantes.map((v) => esc(v.nome) + (v.disponivel ? "" : " (esgotado)")).join(", ")}</p>`;
    $("lbinfo").innerHTML = `<h3>${esc(p.titulo)}</h3><p><strong>${money(p.preco)}</strong>${p.tipo ? " · " + esc(p.tipo) : ""}</p>${vs}` +
      (p.descricao ? `<p>${esc(p.descricao)}</p>` : "") + `<p><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Ver este produto no site</a></p>`;
    show(0);
    $("lb").classList.add("open");
  }
  $("lbx").onclick = () => $("lb").classList.remove("open");
  $("lb").onclick = (e) => { if (e.target.id === "lb") $("lb").classList.remove("open"); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("lb").classList.remove("open"); });

  /* ---------- terminar ---------- */
  $("done").onclick = async () => {
    const falta = seed.produtos.filter((p) => !item(p.id).decisao).length;
    if (falta && !confirm(`Ainda faltam ${falta} produtos sem marcar Manter ou Remover. Quer enviar assim mesmo?`)) return;
    $("done").disabled = true;
    try {
      await post({ action: "finish", by: who() });
      $("donemsg").className = "saved ok";
      $("donemsg").textContent = "Recebido! Obrigado. A equipe da MediaGrowth já pode ajustar a loja.";
    } catch (e) {
      $("donemsg").className = "saved err"; $("donemsg").textContent = "Não conseguimos enviar. Tente de novo.";
    }
    $("done").disabled = false;
  };

  init();
})();

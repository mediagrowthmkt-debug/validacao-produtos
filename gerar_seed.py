#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera o seed da galeria de validação de produtos a partir de uma loja Shopify.
Entra em CADA produto (/products/<handle>.js) pra pegar todas as fotos, variações,
preço e disponibilidade. Stdlib pura. Roda no Mac e na VPS.

Uso:
  gerar_seed.py <slug> <https://loja.com> "Nome da Loja" [--cache DIR] [--cor "#hex"]
"""
import os, sys, json, time, re, urllib.request, urllib.error, argparse, html

REPO = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0 (MediaGrowth validacao-produtos)"}

# Grupo (aba) por palavra no tipo/tags/título. Ordem importa: o primeiro que casar vence.
GRUPOS = [
    ("oculos",     "Óculos",                 r"sunglass|glasses|óculos|oculos"),
    ("bijuterias", "Bijuterias",             r"earring|bracelet|necklace|ring\b|rings|jewel|choker|anklet|pendant|brinco|colar|pulseira|anel|bracelete|cuff"),
    ("acessorios", "Bolsas e acessórios",    r"purse|pouch|bag|wallet|belt|strap|hat|scarf|keychain|clutch|bolsa|carteira|cinto|accessor"),
]
ROUPAS = ("roupas", "Roupas")


def get(url, tries=6):
    if not url.startswith("https://"):
        raise ValueError("só https")
    for i in range(tries):
        try:
            with urllib.request.urlopen(  # nosec B310: esquema validado acima
                urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(2 + i * 3); continue
            raise
        except Exception:
            time.sleep(2 + i * 2)
    raise RuntimeError(f"falhou: {url}")


def img(src, w=700):
    if not src: return ""
    if src.startswith("//"): src = "https:" + src
    return src + ("&" if "?" in src else "?") + f"width={w}"


ROUPA_RX = r"dress|short|legging|shirt|\btop\b|tops|tank|cami|blouse|sweater|hoodie|jean|pant|skirt|romper|jumpsuit|kimono|cardigan|jacket|bodysuit|capri|\bsets?\b|vestido|blusa|saia|cal[cç]a"


def grupo(p):
    titulo = (p.get("title") or "").lower()
    for gid, nome, rx in GRUPOS[:2]:          # óculos e bijuterias pelo título
        if re.search(rx, titulo):
            return gid
    if re.search(ROUPA_RX, titulo):            # roupa antes de acessório ("Paper Bag Shorts")
        return ROUPAS[0]
    if re.search(GRUPOS[2][2], titulo):
        return GRUPOS[2][0]
    base = " ".join([p.get("type") or "", " ".join(p.get("tags") or []), p.get("title") or ""]).lower()
    for gid, nome, rx in GRUPOS:
        if re.search(rx, base):
            return gid
    return ROUPAS[0]


def texto(desc):
    t = re.sub(r"<[^>]+>", " ", desc or "")
    t = html.unescape(re.sub(r"\s+", " ", t)).strip()
    return t[:400]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug"); ap.add_argument("loja"); ap.add_argument("nome")
    ap.add_argument("--cache", help="pasta com <handle>.json já baixados (opcional)")
    ap.add_argument("--cor", default="#2f4a3a")
    a = ap.parse_args()
    loja = a.loja.rstrip("/")
    if not re.fullmatch(r"[a-z0-9\-]{1,64}", a.slug) or not loja.startswith("https://"):
        sys.exit("slug inválido ou loja sem https")

    handles, page = [], 1
    while True:
        d = json.loads(get(f"{loja}/products.json?limit=250&page={page}"))["products"]
        if not d: break
        handles += [p["handle"] for p in d]; page += 1
    print(f"· {len(handles)} produtos no catálogo, entrando em cada um…")

    produtos = []
    for i, h in enumerate(handles, 1):
        raw = None
        if a.cache and os.path.exists(os.path.join(a.cache, f"{h}.json")):
            c = open(os.path.join(a.cache, f"{h}.json"), encoding="utf-8").read()
            if c.startswith("{"): raw = c
        if raw is None:
            raw = get(f"{loja}/products/{h}.js"); time.sleep(0.5)
        p = json.loads(raw)
        variantes = [{
            "id": str(v["id"]),
            "nome": v.get("public_title") or v.get("title") or "Único",
            "disponivel": bool(v.get("available")),
            "preco": (v.get("price") or 0) / 100,
        } for v in p.get("variants", [])]
        unico = len(variantes) == 1
        if unico and variantes[0]["nome"] == "Default Title": variantes[0]["nome"] = "Único"
        produtos.append({
            "id": str(p["id"]),
            "handle": h,
            "titulo": p.get("title", "").strip(),
            "grupo": grupo(p),
            "tipo": p.get("type") or "",
            "preco": (p.get("price") or 0) / 100,
            "preco_de": (p.get("compare_at_price") or 0) / 100,
            "disponivel": bool(p.get("available")),
            "fotos": [img(x) for x in (p.get("images") or [])][:8],
            "foto_grande": [img(x, 1400) for x in (p.get("images") or [])][:8],
            "variantes": variantes,
            "variante_unica": unico,
            "descricao": texto(p.get("description")),
            "url": f"{loja}/products/{h}",
        })
        if i % 25 == 0: print(f"  {i}/{len(handles)}")

    ordem = {g[0]: n for n, g in enumerate(GRUPOS + [ROUPAS])}
    produtos.sort(key=lambda x: (ordem[x["grupo"]], x["titulo"].lower()))
    seed = {
        "slug": a.slug,
        "cliente": a.nome,
        "loja": loja,
        "logo": f"logos/{a.slug}.png",
        "cor": a.cor,
        "gerado_em": time.strftime("%Y-%m-%d %H:%M"),
        "grupos": [{"id": g[0], "nome": g[1]} for g in GRUPOS + [ROUPAS]],
        "produtos": produtos,
    }
    out = os.path.join(REPO, "clients", f"{a.slug}.json")
    json.dump(seed, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print(f"✅ {len(produtos)} produtos → {out}")
    print("   " + " · ".join(f"{g[1]}: {Counter(p['grupo'] for p in produtos)[g[0]]}" for g in GRUPOS + [ROUPAS]))


if __name__ == "__main__":
    main()

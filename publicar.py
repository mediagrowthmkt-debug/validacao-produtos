#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Motor da Galeria de Validação de Produtos (MediaGrowth).
O cliente vê todos os produtos da loja com foto e marca Manter / Remover + quantidade em estoque.
Frontend no GitHub Pages, backend PHP na Hostinger (1 deploy serve todos os slugs). Stdlib pura.

Uso:
  gerar_seed.py <slug> <https://loja.com> "Nome" [--cor "#hex"]   # entra em cada produto e gera o seed
  publicar.py init                                                 # 1ª vez: cria o repo + liga o Pages
  publicar.py backend                                              # scp api.php -> Hostinger
  publicar.py publicar [-m "mensagem"]                             # git push -> GitHub Pages
  publicar.py token <slug> [--novo]                                # gera/rotaciona as chaves do slug (cliente + admin)
  publicar.py link <slug>                                          # links (cliente + admin), lidos do cofre local
  publicar.py listar
"""
import os, sys, json, subprocess, secrets, hashlib, tempfile

REPO = os.path.dirname(os.path.abspath(__file__))
GH_OWNER = os.environ.get("VP_GH_OWNER", "mediagrowthmkt-debug")
GH_REPO  = os.environ.get("VP_GH_REPO",  "validacao-produtos")
PAGES    = os.environ.get("VP_PAGES_URL", f"https://{GH_OWNER}.github.io/{GH_REPO}")
SSH      = os.environ.get("MG_HOSTINGER_SSH", "hostinger-mg")
REMOTE   = os.environ.get("VP_HOSTINGER_DIR", "domains/mediagrowth.com.br/public_html/produtos-api")
API_URL  = os.environ.get("VP_API_URL", "https://mediagrowth.com.br/produtos-api/api.php")
PRIVATE  = os.environ.get("VP_HOSTINGER_PRIVATE", "domains/mediagrowth.com.br/produtos-private")
# Chaves em texto só no cofre LOCAL (nunca no git, nunca na VPS). No servidor vai só o SHA-256.
COFRE    = os.path.expanduser("~/.mediagrowth/acessos/validacao-produtos.json")


def cofre():
    return json.load(open(COFRE, encoding="utf-8")) if os.path.exists(COFRE) else {}


def ssh(cmd, **kw):
    return subprocess.run(["ssh", "-o", "ConnectTimeout=15", SSH, cmd], check=True, **kw)


def cmd_token(slug, novo=False):
    import re
    if not re.fullmatch(r"[a-z0-9\-]{1,64}", slug): sys.exit("slug inválido")
    c = cofre()
    if slug not in c or novo:
        c[slug] = {"client": secrets.token_urlsafe(24), "admin": secrets.token_urlsafe(24)}
        os.makedirs(os.path.dirname(COFRE), exist_ok=True)
        with open(COFRE, "w", encoding="utf-8") as f: json.dump(c, f, indent=1)
        os.chmod(COFRE, 0o600)
    r = ssh(f"cat {PRIVATE}/tokens.json 2>/dev/null || echo '{{}}'", capture_output=True, text=True)
    remoto = json.loads(r.stdout or "{}")
    remoto[slug] = {k: hashlib.sha256(v.encode()).hexdigest() for k, v in c[slug].items()}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t:
        json.dump(remoto, t); tmp = t.name
    ssh(f"mkdir -p {PRIVATE} && chmod 700 {PRIVATE}")
    subprocess.run(["scp", "-q", "-o", "ConnectTimeout=15", tmp, f"{SSH}:{PRIVATE}/tokens.json"], check=True)
    os.unlink(tmp)
    ssh(f"chmod 600 {PRIVATE}/tokens.json")
    print(f"✅ Chaves de '{slug}' no servidor (só hash). Texto no cofre local: {COFRE}")
    links(slug)


def sh(cmd, cwd=REPO, check=True):
    print("· " + " ".join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check)


def git(args):
    return sh(["git", "-c", "user.name=MediaGrowth Deploy", "-c", "user.email=mediagrowthmkt@gmail.com"] + args)


def links(slug):
    k = cofre().get(slug)
    if not k:
        print(f"  (sem chave: rode publicar.py token {slug})"); return
    seedf = os.path.join(REPO, "clients", f"{slug}.json")
    cur = os.path.exists(seedf) and json.load(open(seedf, encoding="utf-8")).get("modo") == "curadoria"
    pg, adm = ("curadoria.html", "curadoria-admin.html") if cur else ("", "admin.html")
    print(f"  Cliente : {PAGES}/{pg}?c={slug}&k={k['client']}")
    print(f"  Admin   : {PAGES}/{adm}?c={slug}&k={k['admin']}")


def cmd_init():
    if not os.path.isdir(os.path.join(REPO, ".git")):
        sh(["git", "init", "-b", "main"])
    open(os.path.join(REPO, ".nojekyll"), "w").write("")          # .gitignore já é versionado no repo
    git(["add", "-A"]); git(["commit", "-m", "galeria de validação de produtos"])
    sh(["gh", "repo", "create", f"{GH_OWNER}/{GH_REPO}", "--public", "--source", ".", "--push"])
    sh(["gh", "api", "-X", "POST", f"repos/{GH_OWNER}/{GH_REPO}/pages",
        "-f", "source[branch]=main", "-f", "source[path]=/"], check=False)
    print(f"✅ Repo + Pages: {PAGES}/  (1ª publicação leva ~1-2 min)")


def cmd_backend():
    sh(["ssh", "-o", "ConnectTimeout=15", SSH,
        f"mkdir -p {REMOTE} {PRIVATE}/data {PRIVATE}/backup && chmod 755 {REMOTE} && chmod 700 {PRIVATE} {PRIVATE}/data {PRIVATE}/backup && echo OK"])
    for f in ("api.php", "_ratelimit.php", ".htaccess"):
        sh(["scp", "-o", "ConnectTimeout=15", os.path.join(REPO, "api", f), f"{SSH}:{REMOTE}/{f}"])
    print(f"✅ Backend no ar: {API_URL}")


def cmd_publicar(msg=None):
    git(["add", "-A"])
    r = subprocess.run(["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True)
    if not r.stdout.strip():
        print("Nada novo para publicar."); return
    git(["commit", "-m", msg or "atualiza galeria de validação de produtos"])
    git(["push", "origin", "main"])
    print(f"✅ Publicado. Pages: {PAGES}/  (~1 min pra atualizar)")


def cmd_listar():
    d = os.path.join(REPO, "clients")
    for f in sorted(os.listdir(d)):
        if f.endswith(".json") and not f.startswith("_"):
            j = json.load(open(os.path.join(d, f), encoding="utf-8"))
            print(f"- {f[:-5]}: {j['cliente']} ({len(j['produtos'])} produtos, gerado {j['gerado_em']})")


def main():
    a = sys.argv[1:]
    if not a: print(__doc__); return
    c = a[0]
    if c == "init": cmd_init()
    elif c == "backend": cmd_backend()
    elif c == "publicar": cmd_publicar(a[a.index("-m") + 1] if "-m" in a else None)
    elif c == "token" and len(a) > 1: cmd_token(a[1], "--novo" in a)
    elif c == "link" and len(a) > 1: links(a[1])
    elif c == "listar": cmd_listar()
    else: print(__doc__)


if __name__ == "__main__":
    main()

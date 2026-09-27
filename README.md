# Galeria de Validação de Produtos (MediaGrowth)

Página onde o cliente vê **todos os produtos da loja com foto** e marca, em cada um:
**Manter** ou **Remover**, a **quantidade em estoque** (por tamanho/cor quando houver) e uma observação.
Salva sozinho, pode parar e voltar. Evita abrir produto por produto no Shopify.

1ª instância: **Ferny Boutique** (`?c=ferny`, 218 produtos, reunião 22/09/2026).

## Fluxo
1. `python3 gerar_seed.py <slug> https://loja.com "Nome" --cor "#hex"` → entra em cada produto (`/products/<handle>.js`) e grava `clients/<slug>.json` (fotos, variações, preço, grupo: Óculos · Bijuterias · Bolsas e acessórios · Roupas).
2. Logo em `logos/<slug>.png`.
3. `python3 publicar.py publicar` (1ª vez do projeto: `init` + `backend`).
4. Link do cliente: `…/?c=<slug>` · resultado interno: `…/admin.html?c=<slug>` (KPIs, filtros, **CSV por variação** pra ajustar o estoque no Shopify).

## Arquitetura
- Frontend estático (GitHub Pages `mediagrowthmkt-debug/validacao-produtos`): `index.html`, `app.js`, `style.css`, `admin.html`, `config.js`.
- Backend `api/api.php` na Hostinger (`mediagrowth.com.br/produtos-api/`), estado por slug em `data/<slug>.json`, trava de arquivo, rate limit.
- Teste local: `php -S 127.0.0.1:8841` e abrir `/?c=<slug>&api=http://127.0.0.1:8841/api/api.php`.
- Regerar o seed não apaga respostas (estado casa pelo ID do produto/variação do Shopify).

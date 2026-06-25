# Deploy do painel no Vercel

O painel web (dashboard) mora **no mesmo repositório** do scraper. O Vercel
publica só a parte web; o GitHub Actions continua rodando o scraper. Os dois
conversam pelo **mesmo banco Supabase**.

```
api/stats.py         → GET  /api/stats        (visão geral do fluxo)
api/news.py          → GET  /api/news?limit=25 (notícias recentes)
api/send_digest.py   → POST /api/send_digest   (gera + envia o boletim da última hora)
public/index.html    → painel servido em /
vercel.json          → config (Python serverless)
.python-version      → 3.12
requirements.txt     → dependências (psycopg, requests, …)
```

## Passo a passo

1. **Importar o repositório**
   - Acesse [vercel.com](https://vercel.com) → **Add New… → Project**.
   - Importe `BrunoJordao-OH/road-news-scraper`.
   - **Framework Preset:** *Other* · **Root Directory:** `./` (raiz do repo).
   - Não precisa mexer em build/output — o Vercel detecta `api/` (Python) e
     serve `public/` como estático automaticamente.

2. **Variáveis de ambiente** (Settings → Environment Variables)
   - `DATABASE_URL` — connection string do Supabase. Para serverless, prefira o
     **Transaction pooler** (porta `6543`): `Connect → Transaction pooler`.
     Já com a senha no lugar do `[YOUR-PASSWORD]`.
   - `RESEND_API_KEY` — *(para o botão de boletim enviar de fato)* chave do Resend.
   - `EMAIL_TO` — destinatário(s), separados por vírgula.
   - `EMAIL_FROM` — *(opcional)* remetente verificado, ex.: `Road News <noticias@over-haul.com>`.
     Sem isso, usa `onboarding@resend.dev` (só envia para o e-mail da sua conta Resend).

3. **Deploy** → o painel fica na URL do Vercel; a API em `/api/...`.

## Comportamento

- O painel mostra **status do fluxo** (última coleta, última hora, 24h, total e
  contagem por fonte) e as **principais notícias** recentes, lendo do Supabase.
- O botão **"Gerar boletim da última hora"**:
  - se `RESEND_API_KEY` + `EMAIL_TO` estiverem configurados, **envia o e-mail**;
  - senão, retorna quantos itens entrariam (sem enviar).
- Se a API estiver indisponível, o painel cai em **modo demonstração** (dados de
  exemplo), então a tela nunca aparece vazia.

## Observações

- O mesmo `DATABASE_URL` do scraper serve aqui. Use o **pooler** (IPv4) do
  Supabase — funções serverless são conexões curtas.
- As funções são **autossuficientes** (não importam o pacote `scraper/`), então o
  bundle de cada função fica leve mesmo com o `requirements.txt` completo.

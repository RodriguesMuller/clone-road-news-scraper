# Como publicar o painel no Vercel (passo a passo)

Este guia é para subir o **painel web** (dashboard) do Road News no Vercel, do
zero. Não precisa saber programar — é seguir os passos clicando.

## O que é este painel

Uma página web que mostra **como está o fluxo de coleta** (última coleta,
quantas notícias na última hora, nas últimas 24h, total e quebra por fonte) e a
**lista das notícias mais recentes**. Ele apenas **lê** o banco Supabase que o
scraper já alimenta — não coleta nem escreve nada.

> O **scraper** continua rodando no GitHub Actions (de hora em hora). O **painel**
> roda no Vercel. Os dois compartilham o mesmo banco Supabase. Você não precisa
> mexer no scraper para publicar o painel.

```
api/stats.py       → /api/stats   (números do fluxo)
api/news.py        → /api/news     (notícias recentes)
public/index.html  → a tela do painel (servida em "/")
```

## Pré-requisitos

1. O código já está no GitHub: **github.com/BrunoJordao-OH/road-news-scraper** ✅
2. A connection string do Supabase (a mesma usada pelo scraper). Você vai pegá-la
   no passo 3.

---

## Passo 1 — Criar conta / entrar no Vercel

1. Acesse **https://vercel.com** e clique em **Sign Up** (ou **Log In**).
2. Escolha **Continue with GitHub** e autorize o Vercel a acessar seus repositórios.

## Passo 2 — Importar o repositório

1. No painel do Vercel, clique em **Add New… → Project**.
2. Na lista de repositórios, encontre **road-news-scraper** e clique em **Import**.
   - Se não aparecer, clique em **Adjust GitHub App Permissions** e libere o repo.
3. Na tela de configuração do projeto:
   - **Framework Preset:** selecione **Other**.
   - **Root Directory:** deixe **`./`** (a raiz do repositório).
   - **Build & Output Settings:** não mexa (deixe em branco/automático — o Vercel
     detecta a pasta `api/` como funções Python e serve a `public/` como site).
   - ⚠️ **Ainda não clique em Deploy** — primeiro adicione a variável do passo 3.

## Passo 3 — Pegar a connection string no Supabase

1. Em **supabase.com**, abra seu projeto → botão **Connect** (no topo).
2. Aba **Transaction pooler** (recomendado para o Vercel, que usa conexões
   curtas). Copie a URI, parecida com:
   ```
   postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres
   ```
3. Troque **`[YOUR-PASSWORD]`** pela senha do banco.
   - Esqueceu a senha? **Settings → Database → Reset database password**.

## Passo 4 — Adicionar a variável de ambiente no Vercel

Ainda na tela de configuração do projeto (ou depois em **Settings →
Environment Variables**), adicione **uma** variável:

| Name | Value |
|------|-------|
| `DATABASE_URL` | a connection string completa do passo 3 (já com a senha) |

Deixe marcada para **Production** (e Preview, se quiser). Clique em **Add**.

## Passo 5 — Deploy

1. Clique em **Deploy** e aguarde (~1–2 min).
2. Ao terminar, o Vercel te dá uma URL, tipo `https://road-news-scraper.vercel.app`.
3. Abra a URL — o painel deve carregar com os dados reais do Supabase.

---

## Como saber se deu certo

- O painel mostra os números e a lista de notícias **reais**.
- Se aparecer a faixa **"Modo demonstração — API indisponível"**, significa que o
  painel não conseguiu ler o banco (geralmente `DATABASE_URL` ausente ou senha
  errada). Ele cai em dados de exemplo para nunca ficar em branco.

## Se algo der errado

- **Modo demonstração ligado / dados não aparecem:** revise a `DATABASE_URL`
  (senha correta? usou o **Transaction pooler**, porta `6543`?). Após corrigir a
  variável, faça um **Redeploy** (Deployments → menu `...` → Redeploy).
- **Ver logs:** no projeto do Vercel → **Logs** (ou abra uma função em
  **Functions**) para ver mensagens de erro das rotas `/api/stats` e `/api/news`.
- **Testar a API direto:** abra `https://SUA-URL.vercel.app/api/stats` no
  navegador — deve retornar um JSON com os números.

## Atualizações futuras

Como o Vercel está conectado ao GitHub, **todo `git push` na branch `main`
dispara um novo deploy automaticamente**. Não precisa repetir esses passos.

> Observação: o envio de **boletim por e-mail foi removido por enquanto**. O
> painel hoje é só de visualização. Quando o e-mail voltar, este guia será
> atualizado com a configuração necessária.

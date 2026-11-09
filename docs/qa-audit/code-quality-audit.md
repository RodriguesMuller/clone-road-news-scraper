# Qualidade de código e scraping

## Scraping
| ID | Prioridade | Problema | Ação | Status |
|---|---|---|---|---|
| SCR-01 | P1 | **Band retornava 0 em silêncio**: o portal mudou as URLs (`/noticias/<slug>` sem o timestamp de 12 dígitos) | Regex aceita o formato novo e o antigo, mas não as páginas de editoria; sem timestamp, `published_at` fica vazio em vez de inventado. A coleta passou de 0 para 9 candidatos | Corrigido. A página agora lista poucos artigos, e a fonte deve ser reavaliada pelo `scraping-engineer` |
| SCR-02 | P2 | Fallback `feedparser.parse(url)` sem timeout, podendo prender o job até 15 min | Fallback via `requests` com `timeout=20` e o UA padrão do feedparser | Corrigido |
| SCR-03 | P2 | Workflow sem `concurrency`: push em main + cron podiam rodar coletas em paralelo, duplicando chamadas de IA | `concurrency: road-news-scraper` | Corrigido |
| SCR-04 | P3 | `actions/checkout@v4` e `setup-python@v5` rodam em Node 20, que está descontinuado | `@v5` / `@v6` | Corrigido |
| SCR-05 | Ops | O GitHub desativa os crons depois de 60 dias sem commits (aconteceu), e o Supabase free pausa depois de cerca de 7 dias sem acesso | Reativados manualmente | Pendente decisão (workflow de keepalive) |
| SCR-06 | Ops | O e-mail semanal nunca é enviado: `RESEND_API_KEY`, `WEEKLY_EMAIL_TO` e `WEEKLY_EMAIL_FROM` estão vazios | — | Pendente configuração |

Pontos verificados sem problema: deduplicação por URL no lote e no banco; toda requisição HTTP tem timeout (15–60 s); cada fonte isolada em try/except, então uma falha não derruba a coleta; `max_items` por fonte; o job tem `timeout-minutes: 15`; não há loop de paginação (nenhuma fonte pagina). Não há retry nem backoff por fonte: o cron de 1 hora funciona como retry, o que é aceitável para notícias.

## Código
- `readBody` estava duplicado em `news-feed.js` e `news-summary.js`, sem limite. Agora os dois usam `_admin.readJson`.
- O caminho de leitura direta no frontend (`supabaseFetch`, `fetchRowsWithOptionalAi`, `TABLE`) foi removido: menos 77 linhas e uma única fonte de dados (`/api/news-feed`).
- Não removi código "morto" fora do escopo de segurança. O `index.html` de 6,8 mil linhas pede modularização, mas isso é refatoração grande sem ganho comprovado agora e contraria a decisão de stack sem build (`CLAUDE.md`).

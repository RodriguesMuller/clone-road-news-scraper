# QA — Central de Evento (2026-11-10)

**Escopo:** a Central de Evento ponta a ponta.
- Detecção automática de eventos graves (`scraper/event_intelligence.py`, executado a cada coleta pelo GitHub Actions).
- Publicação em `platform_events`.
- Leitura pela API (`api/news-feed.js`).
- Encerrar/reabrir pela gestão (`api/news-summary.js`, `action: event-status`).
- A tela `/central-eventos`, com o banner e o contador do menu.

**Método:**
- logs das últimas 15 execuções do scraper em produção;
- leitura do código;
- testes novos de regressão;
- renderização da tela com as funções reais de `public/index.html` em 3 cenários: só evento antigo encerrado, ativo parado e ativo recente.

**Resultado:**
- 1 problema de configuração em produção, que impede a detecção automática. Não se corrige por código.
- 5 defeitos corrigidos.
- Suíte JS 70/70 e Python 47/47.

## Problema de produção: a detecção automática nunca rodou

Todas as execuções recentes do scraper registram:

```
[Eventos] OPENAI_API_KEY ausente; triagem inteligente não executada.
```

O workflow `.github/workflows/scraper.yml` lê `secrets.OPENAI_API_KEY`, mas esse secret **não existe no repositório do GitHub**. Existem só `DATABASE_URL`, `SUPABASE`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. A chave configurada na Vercel não chega ao GitHub Actions.

Consequências:
- Nenhum evento é detectado.
- A Central só tinha o evento do Porto de Santos, publicado manualmente pelo script de curadoria e encerrado em julho.

**Ação necessária (fora do código):**
1. Em GitHub → Settings → Secrets and variables → Actions → New repository secret, criar `OPENAI_API_KEY` com a mesma chave usada na Vercel.
2. Custo estimado: no máximo uma chamada `gpt-4.1-mini` por coleta (de hora em hora), e só quando há notícia candidata nova, porque o lote repetido é reaproveitado pelo fingerprint.

## Defeitos encontrados e correções

| # | Gravidade | Defeito | Como foi corrigido |
|---|---|---|---|
| **1** | Alta | **Evento antigo encerrado aparecia como destaque.** Sem evento ativo, a tela promovia o primeiro evento da lista ao destaque, com selo "Crítico" e texto "Foi identificado um evento…". Em produção, o encerramento de Santos, de julho, ocupava a Central como se fosse o assunto do momento. | Sem evento ativo, a Central diz "Nenhum evento grave ativo". O destaque é só o evento ativo mais recente ou o que o usuário abriu. "Eventos encerrados" mostra só os dos últimos 30 dias. |
| **2** | Alta | **A IA reabria um evento que o gestor tinha encerrado**, mesmo sem nenhuma notícia nova, bastando a classificação repetir "em andamento" a partir das notícias antigas. | Evento encerrado por gestor só é reaberto pela IA quando há notícia publicada **depois** do encerramento (`merge_event`). |
| **3** | Média | **Reabrir mantinha a data de encerramento antiga.** Um evento reaberto mostrava "Em andamento" e, ao mesmo tempo, "Encerramento: 14/07/2026". | Reabrir apaga `ended_on`/`ended_at` (API e motor de eventos). Encerrar grava `ended_at`. A tela só mostra data de encerramento em evento encerrado. |
| **4** | Média | **A data de encerramento "andava".** A cada coleta que repetia um evento já encerrado, `resolved_at` era regravado com o horário da coleta. | Evento já encerrado mantém a data original. |
| **5** | Baixa | **Início do evento pela ordem do texto, não pela data.** `started_at` usava `min()` sobre strings de data, e datas em fusos diferentes (`-03:00` e `+00:00`) ordenavam errado. | Datas convertidas antes de comparar. |
| — | Melhoria | Evento ativo sem notícia nova continuava "Em andamento" indefinidamente, sem nenhum sinal de que a informação estava velha. | Selo "Sem atualização há N dias" quando o evento ativo passa 72h sem atualização, com orientação para confirmar a situação. O sistema não encerra o evento sozinho: isso exigiria inventar um fato. |

## O que foi verificado e está correto

- A triagem determinística barra greves sem relação logística e avisos de rotina do INMET antes da IA.
- A IA não consegue publicar evento com fonte inventada: a evidência precisa ser uma das notícias enviadas.
- O evento precisa de confiança ≥ 0,82.
- A IA só encerra com notícia que afirme liberação ou retomada.
- O lote repetido não chama a IA de novo (fingerprint).
- Falha na triagem não interrompe a coleta.
- Só Admin e Gestor encerram ou reabrem eventos; cliente recebe 403.
- O contador do menu e o banner "Evento crítico em andamento" contam só eventos ativos.
- Links das notícias relacionadas passam por `safeUrl`.

## Testes adicionados

- `tests/test_event_intelligence.py` (`MergeEventTests`), cobrindo:
  - não reabrir sem notícia nova;
  - reabrir com notícia nova;
  - manter a data de encerramento;
  - registrar o encerramento;
  - início pela data real.
- `tests/test_event_center.js`:
  - reabrir apaga a data de encerramento e encerrar grava a nova;
  - cliente não altera o status.

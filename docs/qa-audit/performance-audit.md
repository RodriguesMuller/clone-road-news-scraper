# Performance e escalabilidade

## Medições reais (antes)
| Item | Medição | Fonte |
|---|---|---|
| Coleta completa (11 fontes, sem gravar) | 266 itens em **10,5 s** (17 URLs repetidas no lote, descartadas antes do banco) | Execução local, 2026-11-09 |
| Job do scraper no Actions | 37–50 s fim a fim, com 224 inserts | Runs 42639615674 / 37382586041 |
| Feed: últimas 24h (`created_at >= …`, sort) | **11,4 ms**, seq scan em 23,5 mil linhas | `EXPLAIN ANALYZE` |
| Feed: últimas 50 | **17,2 ms**, seq scan + top-N sort | `EXPLAIN ANALYZE` |
| Feed: INMET (`source ilike or type=`) | **41,8 ms**, seq scan | `EXPLAIN ANALYZE` |
| `/api/news-feed` por carga | 4 consultas em paralelo; com o schema atual, **12 requisições ao PostgREST** (2 falhas por consulta) | Código + erro `42703` |

## Otimizações feitas
- `news-feed`: memoriza qual conjunto de colunas o schema aceita. Uma função quente passa de 12 para **4 requisições** por carga do feed, e o mesmo vale para a análise de rota.
- Índice `news_created_at_idx` (migration, **não aplicada**). As consultas do feed passam de seq scan para index scan; a diferença cresce com a tabela.
- O scraper deixou de executar `DROP/CREATE POLICY` (DDL com lock) a cada hora.

## Depois
Não foi medido em produção: depende do deploy e da migration, que exigem autorização. Para medir, rode novamente os três `EXPLAIN ANALYZE` de [database-audit.md](database-audit.md) depois de aplicar a migration.

## Não feito (e por quê)
- **Teste de carga**: não há ambiente de homologação isolado (o staging usa outro projeto e está sem acesso nesta sessão), e gerar carga contra produção, a Google Routes ou a OpenAI teria custo e risco reais.
- **Filas e workers**: desnecessários no volume atual (coleta de ~11 s por hora). Reavaliar se as fontes passarem de ~50 ou se a coleta passar de alguns minutos.

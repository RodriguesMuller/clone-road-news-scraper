# Changelog — Road News

> Mantido por `tech-docs-agent`, uma entrada por mudança de **comportamento observável** (não por refactor interno sem efeito externo). Não confundir com o changelog interno do PDF em `docs/dist/.docs-pdf-manifest.json` (esse é só sobre a publicação do PDF em si) nem com [`docs/HISTORY.md`](HISTORY.md) (registro fiel de toda mudança, incluindo internas, mantido por `project-historian`).

## 2026-08-06
- **Adicionado**: arquitetura de 23 subagents especializados do Claude Code (`.claude/agents/`), documentada em `docs/AGENTS.md` e `CLAUDE.md`.
- **Adicionado**: `docs-publisher` — consolida `/product` + `/docs` em um PDF único e sempre atualizado (`docs/dist/road-news-documentation.pdf`).

## 2026-08-05
- **Melhorado**: marcadores de risco sobrepostos no mapa agora se agrupam e reagrupam por nível de zoom.
- **Corrigido**: rodovias citadas na análise de rota sem geolocalização precisa agora ainda recebem marcador no mapa.
- **Melhorado**: marcador da rota mostra km e descrição curta sempre visíveis.
- **Melhorado**: visibilidade de trechos de risco no mapa da tela Minha Rota.
- **Adicionado**: sinalização de bloqueios/riscos na rota com descrição e segmento destacado no mapa.
- **Corrigido**: janela de notícias consideradas na análise de rota reduzida de 72h para 24h (relevância).
- **Adicionado**: suporte a paradas intermediárias na análise de rota (Minha Rota).
- **Corrigido**: lacunas de classificação de risco identificadas em QA visual; bug de KPI exibindo vazio quando o valor real era zero.
- **Melhorado**: resumos de IA agora são instruídos a agregar valor além de repetir o título.
- **Corrigido**: campo de região corrompido quando a saída de IA não era validada.
- **Melhorado**: classificação de risco diferenciada em vez de default para "Alto".
- **Segurança**: removidos detalhes internos de arquitetura do copy do painel admin.

---

*Entradas anteriores a 2026-08-05 não foram retroativamente documentadas aqui — consultar `git log` para o histórico completo do repositório.*

# Segurança — Road News

> Mantido por `tech-docs-agent`. Dono da revisão contínua: `security-reviewer` (somente leitura — acha e prioriza, não corrige). Ver [`docs/AGENTS.md`](AGENTS.md).

## Modelo de autenticação e autorização

- **Autenticação**: Supabase Auth, Bearer token (`Authorization: Bearer <token>`) — não é sessão por cookie, então CSRF clássico é baixo risco (ver `security-reviewer`).
- **Autorização**: resolvida sempre no servidor a partir do `user_id` autenticado (`api/_auth.js: requireAccount`), nunca de um campo enviado pelo cliente. Papel (`admin`/`manager`/`client`) e pacote/quota controlam o que cada requisição pode fazer.
- **Isolamento de tenant**: duas camadas — RLS no Postgres (via funções `SECURITY DEFINER`) **e** filtro explícito por `client_id`/`user_id` no código da API (defesa em profundidade; RLS é a rede de segurança, não a única validação).

## Superfícies de risco reais deste produto

1. **SSRF** — o backend busca URLs a partir de fontes de scraper, Google Routes, OpenAI. Qualquer URL nova buscada pelo servidor a partir de dado não confiável precisa de allowlist de domínio/esquema.
2. **XSS armazenado** — título/resumo de notícia vêm de fontes externas não confiáveis e são renderizados em `public/index.html` via `innerHTML`. O projeto já tem um helper `escapeHtml` (baseado em `textContent`, seguro) usado consistentemente nos pontos revisados — toda interpolação nova de campo de origem externa em `innerHTML` precisa passar por ele.
3. **Vazamento de tenant** — o risco mais caro do produto: um cliente ver dado de outro. Mitigado por RLS + filtro explícito, testado com usuário de papel/tenant diferente antes de qualquer mudança em `api/_auth.js`, `api/admin-*.js` ou policy de RLS.
4. **Exposição de segredo** — `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, `RESEND_API_KEY`. Nenhuma dessas chaves aparece em `public/**` nem em log de execução (GitHub Actions loga host/porta da conexão, nunca a connection string inteira).
5. **LGPD** — duas frentes distintas: dado do usuário da plataforma (CPF mascarado em listagem, `api/_admin.js`) e dado pessoal de terceiro citado em notícia raspada (nome de vítima de acidente, por exemplo) — segunda frente é responsabilidade de `compliance-advisor`, não do código.

## Regras derivadas da auditoria de 2026-11-09 ([`docs/qa-audit/`](qa-audit/final-report.md))

- **Nenhuma tabela legível por `anon`.** O navegador só usa o Supabase para Auth; dados sempre via `api/*` com service role. O scraper não executa DDL de RLS/policy.
- Funções `SECURITY DEFINER` novas: `REVOKE EXECUTE ... FROM public, anon` na mesma migration.
- Filtros PostgREST montados com entrada do usuário usam `eq.`, nunca `ilike.`/`like.` (curinga `*`).
- Corpo de requisição sempre via `_admin.readJson` (teto de 256 KB, 400 em JSON inválido); texto do navegador enviado à IA sempre com teto de tamanho.
- Script/CSS de CDN só com versão exata + `integrity` (SRI). Headers de segurança ficam em `vercel.json`.
- Leaflet `bindTooltip`/`bindPopup` com string renderizam HTML: escapar como `innerHTML`.

## O que NÃO é prioridade de revisão aqui

CSRF (modelo Bearer-token, não cookie) — não gaste ciclo de revisão nisso a menos que um fluxo novo introduza cookie de sessão.

## Processo

Toda mudança em `api/_auth.js`, `api/admin-*.js`, políticas de RLS, ou qualquer URL nova buscada pelo servidor passa por `security-reviewer` antes do merge — achados classificados `[BLOQUEANTE]/[ALTO]/[MÉDIO]/[SUGESTÃO]`, cada um com arquivo:linha e correção proposta (não implementada por ele). Achado `[BLOQUEANTE]` impede merge.

## Se um segredo vazar

Rotação de credencial é decisão humana imediata, fora do fluxo normal de revisão — `security-reviewer` escala diretamente ao usuário ao encontrar evidência de vazamento em produção (não só no código-fonte).

## Reportar uma vulnerabilidade

Este é um projeto interno; reporte diretamente à equipe responsável pelo repositório, sem abrir issue pública descrevendo o achado antes de uma correção estar disponível.

# Auditoria de segurança

Legenda de status: **Corrigido (código)** = está na branch `qa-audit` com teste; **Pendente aplicação** = migration ou configuração pronta, mas não aplicada em produção; **Pendente decisão** = depende do responsável pelo produto.

| ID | Prioridade | Vulnerabilidade | Evidência (produção, 2026-11-09) | Correção | Status |
|---|---|---|---|---|---|
| SEC-01 | **P0** | A tabela `news` (23.542 linhas) pode ser lida **sem login** com a chave pública do frontend, contornando o login e as cotas por pacote | `GET /rest/v1/news?select=title,source` com `apikey` pública → **HTTP 206** com dados. Policy `"Allow public read news"` com `USING (true)` para `anon`. | Frontend lê só via `/api/news-feed`; scraper deixou de recriar a policy ([postgres.py](../../scraper/storage/postgres.py)); migration remove a policy e os grants | Corrigido (código) · **Pendente aplicação** |
| SEC-02 | P1 | Funções `SECURITY DEFINER` executáveis por `anon` via `/rpc`: revelam o papel de qualquer UUID | `POST /rest/v1/rpc/get_user_role` como anon com o UUID do admin → `"admin"`; `is_admin` → `true` | `REVOKE EXECUTE ... FROM public, anon` na migration | **Pendente aplicação** |
| SEC-03 | P1 | Convite e recuperação de senha quebrados: `site_url = http://localhost:3000`, `uri_allow_list` vazio e `/accept-invite` → **404** na Vercel | Config de Auth lida pela API; `curl /accept-invite` → 404 | Rewrites `/accept-invite` e `/auth/callback` em `vercel.json`. **Configuração do Auth** (`site_url` e allow list) precisa ser aplicada | Corrigido (código) · **Pendente aplicação** |
| SEC-04 | P1 | Auth: cadastro público habilitado (`disable_signup=false`) em produto só por convite; senha mínima de 6; verificação de senha vazada (HIBP) desligada | Config de Auth | Ver "Configuração de Auth recomendada" abaixo | **Pendente decisão** |
| SEC-05 | P1 | `news-summary` repassava à OpenAI texto de tamanho ilimitado enviado pelo navegador (abuso de custo / proxy de LLM; perfis privilegiados não têm cota) | Código | Teto por campo (título 300, resumo 2000…) | Corrigido |
| SEC-06 | P2 | Corpo das requisições sem limite e JSON inválido devolvendo 403/500 | Código | `readJson` centralizado: 256 KB e 400 "Requisicao invalida." | Corrigido |
| SEC-07 | P2 | Exclusão de usuário por e-mail usava `ilike`: `email=*` resolvia para um usuário arbitrário, inclusive o próprio admin | Código + teste de reprodução | `eq.` e checagem de autoexclusão depois de resolver o alvo | Corrigido |
| SEC-08 | P2 | Supply chain: `@supabase/supabase-js@2` sem versão exata e sem SRI no unpkg | `<script src=".../supabase-js@2">` | Fixado em `2.118.0` + `integrity` sha384 nos 6 assets de CDN | Corrigido |
| SEC-09 | P2 | Sem headers de segurança (clickjacking, sniffing) e API sem `no-store` | `curl -I` só mostrava HSTS | `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP `frame-ancestors 'none'` | Corrigido · CSP completa pendente |
| SEC-10 | P3 | Tooltips do Leaflet recebiam texto raspado sem escape (`bindTooltip` usa innerHTML) | Código | `escapeHtml` | Corrigido |
| SEC-11 | P2 | `usage-event` gravava `metadata` arbitrário enviado pelo navegador | Código | Só aceita objeto ≤ 2000 caracteres | Corrigido |
| SEC-12 | P2 | Dependências com CVE: `requests 2.32.0`, `python-dotenv 1.0.1` | `pip-audit`: 6 vulnerabilidades | `requests 2.33.1`, `python-dotenv 1.2.2`; `pip-audit` → 0 | Corrigido |
| SEC-13 | P2 | `scripts/` (gerador do PDF de docs, não vai para deploy): 12 high e 1 moderate (puppeteer/markdown-it) | `npm audit` | Requer subir o puppeteer de versão major (25.x) e testar o build do PDF | **Pendente** |
| SEC-14 | P2 · compliance | Scraper usa User-Agent de Chrome falsificado e, quando o site responde 403, tenta de novo com outro UA (Blog do Caminhoneiro bloqueia ativamente) | Log do Actions | Avaliação do `compliance-advisor`: respeitar o 403 pode zerar a fonte; trocar o UA pode afetar G1 e CNN | **Pendente decisão** |

## Segredos e chaves
- Varredura de **todo o histórico do git** (todas as branches) atrás de chaves OpenAI, JWT, `sb_secret`, `sbp_`, connection strings, chaves Resend/Google e tokens do GitHub: **nenhum segredo real**, apenas placeholders (`[YOUR-PASSWORD]`, `SUA_SENHA`, `sk-proj_xxx`).
- `.env` e `.env.*` estão no `.gitignore`; `.env.example` não tem valores reais.
- O frontend contém só a **publishable key** e a URL do projeto, que são públicas por design. A service role, a chave da OpenAI e a do Google Routes ficam só no servidor (Vercel, todas do tipo `sensitive`).
- ⚠️ **Rotacionar:** o token de gerenciamento do Supabase `road_news` (`sbp_…`) foi colado no chat desta auditoria. Revogue em <https://supabase.com/dashboard/account/tokens>.

## Autorização e isolamento entre perfis (revisão de código)
- Todo endpoint autentica pelo Bearer e resolve papel e pacote **no servidor** (`requireAccount`); nenhum endpoint confia em `role` ou `client_id` vindos do corpo.
- **Admin e gestor**: gestor não lê, não altera nem cria usuários admin (`admin-user-profile`, `admin-user-status`, `admin-user-package`, `normalizeRole`); excluir usuário ou pacote é exclusivo do admin.
- **Cliente**: não chega a nenhum `admin-*` (`requireManager`); só lê o próprio pacote e consumo (`my-access`); `usage-event` só registra eventos da própria conta e passa pela cota.
- **Sem login**: todos os endpoints de dados respondem 403 "Login necessario." (testado em produção). A exceção era a REST direta (SEC-01).
- **Gestor criando gestor**: é permitido pelo código. Pelo modelo de negócio (gestor = equipe da plataforma) isso é intencional, **mas a constraint de produção impede** (ver DB-01).
- **Não testado ao vivo**: os fluxos por perfil com contas reais. Não existem contas de teste, e criá-las em produção gravaria dados reais. Ver pendências.

## Configuração de Auth recomendada (aguarda autorização)
| Chave | Atual | Recomendado |
|---|---|---|
| `site_url` | `http://localhost:3000` | `https://road-news-scraper.vercel.app` |
| `uri_allow_list` | vazio | `https://road-news-scraper.vercel.app/**,https://road-news-teal.vercel.app/**` |
| `disable_signup` | `false` | `true` (produto só por convite; antes, confirmar que o convite via service role continua funcionando) |
| `password_min_length` | 6 | 8 (igual à regra da API) |
| `password_hibp_enabled` | `false` | `true` (pode exigir plano Pro) |

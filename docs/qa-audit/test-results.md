# Resultados de testes (execuções reais, 2026-11-09)

| Suíte | Antes (main @ 3534ab2) | Depois (branch qa-audit) |
|---|---|---|
| Python `unittest` | 22 / 22 ok | **25 / 25 ok** (+3) |
| Node `node:test` | 20 / 20 ok | **33 / 33 ok** (+13) |
| `pip-audit` | 6 vulnerabilidades (requests, python-dotenv) | **0** |
| `npm audit` (`scripts/`, só ferramenta de docs) | 12 high e 1 moderate | sem mudança (pendente) |

Comandos: `python -m unittest discover -s tests` e `node --test tests/*.js`.

## Validação dos testes novos
Os testes novos foram rodados **contra o código antigo**: falharam **11 de 12** de JS e **2 de 2** de Python (o único que passou verifica o arquivo da migration, que é novo). O teste da regex da Band foi escrito depois, já sobre o formato novo. Ou seja, os testes detectam os defeitos que cobrem.

Arquivos: [`tests/test_security_hardening.js`](../../tests/test_security_hardening.js) e [`tests/test_scraper_hardening.py`](../../tests/test_scraper_hardening.py). Um teste existente foi ajustado: o mock de `profiles?email=ilike.` passou a `eq.` em `test_production_access.js`, refletindo a correção SEC-07.

## Testes ao vivo em produção (só leitura ou sem credencial)
| Teste | Resultado |
|---|---|
| Endpoints de dados sem login (`news-feed`, `my-access`, `admin-data`, `weekly-summary`, POST de rota com JSON inválido) | 403 "Login necessario." ✅ |
| REST direta `news` com a chave pública | **206 com dados** ❌ (SEC-01) |
| REST direta `profiles`/`clients`/`packages`/`usage_events` como anon | 42501 permission denied ✅ |
| `platform_events` como anon | `[]` (RLS sem policy) ✅ |
| INSERT anônimo em `news` | 401 RLS ✅ |
| `rpc/get_user_role` e `rpc/is_admin` como anon | revelam o papel ❌ (SEC-02) |
| Signup anônimo | desabilitado ✅; signup por e-mail **habilitado** ⚠️ (SEC-04) |
| `/accept-invite` | 404 ❌ (SEC-03) |
| Coleta real das 11 fontes com as dependências novas | 266 itens, 10,5 s ✅ |

## CI
Antes, nenhum workflow rodava a suíte. Foi adicionado [`.github/workflows/tests.yml`](../../.github/workflows/tests.yml) (push em main, PRs e disparo manual). Ele **ainda não rodou** porque a branch não foi publicada.

## Pendentes (não executados)
- E2E no navegador (login, convite, recuperação de senha, telas por perfil): não há Playwright na stack, e as contas de teste não existem.
- Testes por perfil ao vivo (admin, gestor, cliente) e isolamento entre clientes com dois tenants reais: exigem criar usuários. Recomendo fazer no staging.
- Cobertura percentual: as suítes nativas não medem cobertura, então nenhum percentual é informado.

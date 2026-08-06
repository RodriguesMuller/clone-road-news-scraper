# Onboarding — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-08-06 (primeira publicação). Reflete o fluxo real de provisionamento hoje — manual, não self-service.

## Fluxo real (hoje)

1. **Gestor da plataforma** (`manager`/`admin`) cria o cliente (`clients`) pelo painel — `/gestor` ou `/admin` → tela Clientes.
2. Cria o(s) usuário(s) (`profiles`) vinculados a esse cliente (`/usuarios`), com CPF, e-mail, telefone.
3. Vincula um pacote ativo (`/pacotes` → `user_packages`) definindo os limites mensais e as features habilitadas para aquele usuário/cliente.
4. Usuário recebe convite/acesso via Supabase Auth (template de convite em `scripts/supabase_invite_email_template.html`) e faz login.
5. Primeira experiência do usuário: dashboard, sem necessariamente nenhum alerta crítico ativo no momento — isso é esperado, não é um sinal de sistema quebrado (ver nota de design abaixo).

## Não existe hoje

Self-signup, trial automático, ou onboarding sem intervenção de `manager`/`admin`. Todo cliente novo entra por provisionamento manual.

## Nota de design importante

A maioria dos dias não tem evento crítico ativo — a tela principal precisa deixar claro que "sem alerta" é o sistema funcionando corretamente monitorando em segundo plano, não uma tela vazia por falha. Isso é responsabilidade de `ux-product-designer`/`frontend-engineer` ao desenhar o dashboard, mas é uma decisão de produto que nasce aqui: o valor do produto no dia a dia normal é a garantia silenciosa de monitoramento, não só o alerta em si.

## O que falta para um onboarding self-service (se/quando fizer sentido)

Fluxo de cadastro próprio, seleção de pacote com pagamento integrado, e confirmação de e-mail sem intervenção manual — nenhum desses existe hoje; avaliar como iniciativa de produto separada, não assumir como próximo passo automático.

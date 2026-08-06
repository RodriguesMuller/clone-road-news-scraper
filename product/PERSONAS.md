# Personas — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-08-06 (primeira publicação). Personas derivadas dos três papéis reais do sistema (`admin`/`manager`/`client` em `profiles.role`) e do domínio de gerenciamento de risco — não pesquisa de usuário formal ainda (ver nota no final).

## Cliente operacional (papel `client`)

**Quem é**: gestor de risco ou analista de torre de controle numa transportadora, embarcador de carga de alto valor, ou na própria gerenciadora de risco atendendo um contrato de cliente.

**O que precisa decidir**: "esta carga pode sair agora por esta rota?" / "este alerta exige ação imediata ou é só monitoramento?"

**Frustração que o produto resolve**: informação sobre rodovia espalhada, sem gravidade clara, sem cruzamento com a rota real da carga.

**Onde vive no produto**: dashboard, alertas, mapa, Minha Rota, resumo semanal — as telas de consumo, limitadas pelo pacote do cliente.

**O que faria essa persona abandonar o produto**: alerta que não é acionável (severidade errada, sem justificativa), ou a tela ficar sem resposta quando a IA está fora do ar.

## Gestor da plataforma (papel `manager`, aparece como "gestor" na UI)

**Quem é**: alguém dentro da gerenciadora de risco responsável por administrar os clientes que ela atende — criar cliente, vincular usuário, ajustar pacote, acompanhar consumo.

**O que precisa decidir**: "este cliente precisa de mais quota?" / "este usuário deveria ter acesso a quê?"

**Onde vive no produto**: telas `/gestor`, `/clientes`, `/usuarios`, `/pacotes`, `/consumo`, `/fontes-gestor`, `/relatorios-gestor`.

**Acesso**: operacional ilimitado (não é limitado por pacote como o `client`), mas não tem acesso administrativo total do sistema (isso é `admin`).

## Administrador (papel `admin`)

**Quem é**: responsável técnico/operacional pela plataforma como um todo — não um cliente, não um gestor de conta.

**Onde vive no produto**: `/admin`, `/monitoramento`, `/integracoes`, `/banco`, `/logs`, e as telas `/developer/*` (visão mais técnica: fontes, relatórios, usuários, pacotes, consumo, configurações).

**O que precisa decidir**: saúde do sistema, integridade de dado, configuração de fonte/integração.

## Nota sobre validação

Estas personas foram derivadas da estrutura técnica real (papéis, telas, limites de pacote) — não substituem entrevista com cliente real. Antes de usar em material de venda, validar com pelo menos um cliente/gestor real por persona.

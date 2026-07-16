#!/usr/bin/env bash
set -euo pipefail

# Usage:
# 1) Export VERCEL_TOKEN and VERCEL_PROJECT (project id or org/project-slug)
# 2) Put your variables in a .env file at repository root (or pass path as first arg)
# 3) Run: ./scripts/set_vercel_env.sh

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Arquivo $ENV_FILE não encontrado. Crie a partir de .env.example e coloque as chaves sensíveis." >&2
  exit 1
fi

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "Defina VERCEL_TOKEN no seu ambiente: export VERCEL_TOKEN=...
Você pode criar um token em https://vercel.com/account/tokens" >&2
  exit 1
fi

if [ -z "${VERCEL_PROJECT:-}" ]; then
  echo "Defina VERCEL_PROJECT (project id ou slug) no seu ambiente: export VERCEL_PROJECT=org/project" >&2
  exit 1
fi

# Variables to set in Vercel (adaptar conforme necessário)
VARS=(
  DATABASE_URL
  OPENAI_API_KEY
  OPENAI_MODEL
  OPENAI_IMAGE_MODEL
  AUTH_ENABLED
  NEXT_PUBLIC_AUTH_ENABLED
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  APP_URL
  APP_ENV
  STAGING_READ_ONLY
  RESEND_API_KEY
  INVITE_EMAIL_FROM
  INVITE_EMAIL_REPLY_TO
  WEEKLY_EMAIL_FROM
  WEEKLY_EMAIL_TO
)

# Load .env values into associative array
declare -A envvals
while IFS='=' read -r key value; do
  # skip comments and empty
  [[ "$key" =~ ^# ]] && continue
  [[ -z "$key" ]] && continue
  key=$(echo "$key" | tr -d ' '\''\"')
  value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//')
  envvals[$key]="$value"
done < <(grep -v '^\s*$' "$ENV_FILE")

VERCEL_API="https://api.vercel.com/v9/projects/${VERCEL_PROJECT}/env"

# helper: delete existing env vars with same key
function delete_existing() {
  local key="$1"
  local list_url="https://api.vercel.com/v9/projects/${VERCEL_PROJECT}/env"
  local existing
  existing=$(curl -s -H "Authorization: Bearer ${VERCEL_TOKEN}" "$list_url" | jq -r ".env[] | select(.key==\"$key\") | .uid")
  if [ -n "$existing" ]; then
    echo "Removendo entradas existentes para $key"
    echo "$existing" | while read -r uid; do
      curl -s -X DELETE -H "Authorization: Bearer ${VERCEL_TOKEN}" "https://api.vercel.com/v9/projects/${VERCEL_PROJECT}/env/$uid" >/dev/null
    done
  fi
}

for key in "${VARS[@]}"; do
  value="${envvals[$key]:-}"
  if [ -z "$value" ]; then
    echo "Aviso: variável $key não encontrada em $ENV_FILE — pulando"
    continue
  fi

  echo "Atualizando $key..."
  delete_existing "$key"

  payload=$(jq -n --arg k "$key" --arg v "$value" '{key:$k, value:$v, target:["production","preview","development"], type:"encrypted"}')
  resp=$(curl -s -X POST -H "Authorization: Bearer ${VERCEL_TOKEN}" -H "Content-Type: application/json" -d "$payload" "$VERCEL_API")
  ok=$(echo "$resp" | jq -r '.key // empty') || true
  if [ "$ok" = "$key" ]; then
    echo "  -> $key definido com sucesso"
  else
    echo "  -> falha ao definir $key: $(echo "$resp" | jq -c .)" >&2
  fi
done

echo "Concluído. Verifique no painel Vercel as variáveis atribuídas." 

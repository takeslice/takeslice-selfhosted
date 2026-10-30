#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
SECRETS_FILE="$DATA_DIR/secrets.env"

mkdir -p "$DATA_DIR/uploads"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Generating application secrets in $SECRETS_FILE"
  umask 077
  {
    echo "BETTER_AUTH_SECRET=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
    echo "ENCRYPTION_KEY=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
  } > "$SECRETS_FILE"
fi

# Load generated secrets without overriding values the operator set explicitly.
while IFS='=' read -r key value; do
  case "$key" in
    ''|\#*) continue ;;
  esac
  eval "current=\${$key:-}"
  if [ -z "$current" ]; then
    export "$key=$value"
  fi
done < "$SECRETS_FILE"

if [ "${1:-}" = "" ]; then
  echo "No command given." >&2
  exit 1
fi

exec "$@"

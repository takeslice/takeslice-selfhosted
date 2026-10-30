#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
SECRETS_FILE="$DATA_DIR/secrets.env"
RUN_AS_ROOT=0

if [ "$(id -u)" = "0" ]; then
  RUN_AS_ROOT=1
fi

# The named volume is created by Docker as root. Prepare it before the app user
# starts, whether this is the app, the migrator or the worker container.
mkdir -p "$DATA_DIR/uploads"
if [ "$RUN_AS_ROOT" = "1" ]; then
  chown app:app "$DATA_DIR" "$DATA_DIR/uploads" 2>/dev/null || true
fi

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Generating application secrets in $SECRETS_FILE"
  umask 077
  candidate="$SECRETS_FILE.$$"
  {
    echo "BETTER_AUTH_SECRET=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
    echo "ENCRYPTION_KEY=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
  } > "$candidate"
  # App and worker start together. The hard link publishes exactly one generated
  # file; the loser reads the winner's file instead of overwriting it.
  if ln "$candidate" "$SECRETS_FILE" 2>/dev/null; then
    if [ "$RUN_AS_ROOT" = "1" ]; then
      chown app:app "$SECRETS_FILE"
    fi
  fi
  rm -f "$candidate"
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

# Do not run the web server or worker as root. The migrator also runs as the app
# user; it needs no privileged access to PostgreSQL.
if [ "$RUN_AS_ROOT" = "1" ]; then
  exec su-exec app "$@"
fi

exec "$@"

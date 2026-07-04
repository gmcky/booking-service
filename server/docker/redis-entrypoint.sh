#!/bin/sh
set -e

[ -z "$REDIS_PASSWORD" ] && { echo "REDIS_PASSWORD required" >&2; exit 1; }

PW_HASH=$(printf '%s' "$REDIS_PASSWORD" | sha256sum | cut -d' ' -f1)

cat > /tmp/users.acl << EOF
user default off
user booking on #${PW_HASH} ~* &* +@all -FLUSHALL -FLUSHDB -DEBUG -SHUTDOWN -MODULE -CLUSTER
EOF

exec redis-server \
  --appendonly yes \
  --loglevel warning \
  --notify-keyspace-events KEA \
  --aclfile /tmp/users.acl \
  --acllog-max-len 128

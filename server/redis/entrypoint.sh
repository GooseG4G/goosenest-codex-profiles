#!/bin/sh

set -eu

: "${REDIS_USERNAME:?REDIS_USERNAME is not set}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD is not set}"

case "${REDIS_USERNAME}" in
  *[!A-Za-z0-9._-]*)
    echo "REDIS_USERNAME contains unsupported characters" >&2
    exit 1
    ;;
esac

acl_directory=/run/redis
acl_file="${acl_directory}/users.acl"

PASSWORD_HASH="$(printf '%s' "${REDIS_PASSWORD}" | sha256sum | cut -d ' ' -f 1)"

install -d -m 700 "${acl_directory}"
umask 077

cat > "${acl_file}" <<EOF
user ${REDIS_USERNAME} on #${PASSWORD_HASH} ~* &* +@all
user default off
EOF

exec redis-server "$@" --aclfile "${acl_file}"

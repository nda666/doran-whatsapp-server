#!/bin/bash
set -euo pipefail
umask 077
export PATH=/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin
APP=/home/jeblast/repos/doran-whatsapp-server
STATE=/home/jeblast/.local/state/doran-maintenance
mkdir -p "$STATE"
exec 9>"$STATE/maintenance.lock"
flock -n 9 || exit 0
cd "$APP"
# One daily report replaces shell output; detailed reports retained by maintenance.cjs.
exec node "$APP/deployment/maintenance.cjs" "$@" > "$STATE/latest.log" 2>&1

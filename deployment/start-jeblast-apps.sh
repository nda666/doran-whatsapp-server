#!/bin/bash
# One cron entry starts both apps serially, avoiding competing PM2 daemons at boot.
set -euo pipefail
umask 077
export HOME=/home/jeblast
export PM2_HOME="$HOME/.pm2"
export PATH="$HOME/.local/share/doran-node/node-v24.21.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin"
mkdir -p "$PM2_HOME"
exec 9>"$PM2_HOME/boot-start.lock"
flock -w 180 9 || exit 1

start_app() {
  local name="$1" config="$2" attempt processes
  for attempt in {1..6}; do
    if processes=$(timeout 45 /usr/local/bin/pm2 jlist) &&
      printf '%s' "$processes" | node -e '
        let input = "";
        process.stdin.on("data", chunk => input += chunk);
        process.stdin.on("end", () => {
          try {
            const apps = JSON.parse(input);
            process.exit(apps.some(app => app.name === process.argv[1] &&
              ["online", "launching"].includes(app.pm2_env.status)) ? 0 : 1);
          } catch { process.exit(1); }
        });
      ' "$name"; then
      echo "$(date -Is) $name already running"
      return 0
    fi
    if timeout 60 /usr/local/bin/pm2 start "$config" --only "$name"; then
      echo "$(date -Is) $name started"
      return 0
    fi
    echo "$(date -Is) $name startup attempt $attempt failed" >&2
    sleep 10
  done
  return 1
}

echo "$(date -Is) boot startup begin"
# Try both even when one app fails; return failure if either cannot start.
result=0
start_app doran-whatsapp "$HOME/repos/doran-whatsapp-server/ecosystem.config.js" || result=1
start_app backendsms "$HOME/backendsms.jeblast.com/ecosystem.config.js" || result=1
echo "$(date -Is) boot startup complete result=$result"
exit "$result"

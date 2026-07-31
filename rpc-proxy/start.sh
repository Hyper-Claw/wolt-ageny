#!/bin/sh
# Start Tor, wait until its SOCKS port accepts connections, then run the bridge.
set -e

# Run Tor in the background. Default config gives us a SOCKS proxy on 9050.
tor --SocksPort 9050 --Log "notice stdout" &
TOR_PID=$!

echo "waiting for Tor to bootstrap…"
# Poll the SOCKS port with a tiny node TCP probe (dash has no /dev/tcp).
i=0
while [ $i -lt 60 ]; do
  if node -e 'require("net").connect(9050,"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))' 2>/dev/null; then
    echo "Tor SOCKS port is up."
    break
  fi
  i=$((i + 1))
  sleep 1
done

# Give the circuit a moment to finish building before first requests.
sleep 3

# If Tor died, don't pretend we're healthy.
if ! kill -0 "$TOR_PID" 2>/dev/null; then
  echo "Tor exited during bootstrap" >&2
  exit 1
fi

exec node server.js

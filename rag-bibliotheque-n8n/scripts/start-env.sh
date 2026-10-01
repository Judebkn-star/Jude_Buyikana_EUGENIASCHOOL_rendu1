#!/bin/bash
# Démarre l'environnement du RAG en n'exposant AUCUN port sur le réseau (tout sur 127.0.0.1).
#  - Colima : docker.ip = 127.0.0.1 dans ~/.colima/default/colima.yaml (ports du réseau Docker par défaut, donc n8n).
#  - Supabase : son réseau est créé ici avec host_binding_ipv4 = 127.0.0.1. Supabase le crée sinon sans l'option,
#    et ses ports (Postgres postgres/postgres, API avec clés de démo, Studio sans auth) s'ouvrent sur tout le Wi-Fi.
# Usage : scripts/start-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
NET=supabase_network_rag-48-lois

colima status >/dev/null 2>&1 || colima start
grep -q '^  ip: 127.0.0.1' ~/.colima/default/colima.yaml || { echo "ERREUR : docker.ip ≠ 127.0.0.1 dans colima.yaml"; exit 1; }

if ! docker network inspect $NET --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}' 2>/dev/null | grep -q 127.0.0.1; then
  supabase stop >/dev/null 2>&1 || true
  docker network disconnect $NET n8n >/dev/null 2>&1 || true
  docker network rm $NET >/dev/null 2>&1 || true
  docker network create --label com.supabase.cli.project=rag-48-lois --label com.docker.compose.project=rag-48-lois \
    -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 $NET >/dev/null
fi
supabase start -x gotrue,realtime,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor >/dev/null
docker network connect $NET n8n 2>/dev/null || true

# Contrôle : aucun port ne doit écouter ailleurs que sur 127.0.0.1.
if docker ps --format '{{.Ports}}' | grep -qE '0\.0\.0\.0|\[::\]'; then
  echo "ERREUR : un port est publié sur toutes les interfaces :"; docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E '0\.0\.0\.0|\[::\]'; exit 1
fi
echo "OK : n8n http://localhost:5678 · Studio http://localhost:54323 · aucun port ouvert sur le réseau."

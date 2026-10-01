#!/bin/bash
# Pose une question au chat (workflow C) en ligne de commande.
# Usage : scripts/ask.sh "<question>" [sessionId]
SESSION="${2:-cli-$(date +%s)}"
curl -s -m 180 -X POST "http://localhost:5678/webhook/6f9792c4-9e03-4f4a-bc44-8664b907b3c8/chat" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"action":"sendMessage","sessionId":sys.argv[1],"chatInput":sys.argv[2]}))' "$SESSION" "$1")" \
| python3 -c 'import sys,json
raw=sys.stdin.read()
try:
  d=json.loads(raw,strict=False)
except Exception:
  print(raw); sys.exit()
d=d[0] if isinstance(d,list) else d
print("REQUÊTE :", d.get("query"), "| livres filtrés:", d.get("books"), "| reranked:", d.get("reranked"), "| citations:", d.get("quotes"))
print("SOURCES :", *d.get("sources",[]), sep="\n  - ")
print("\n" + (d.get("output") or json.dumps(d, ensure_ascii=False)))'

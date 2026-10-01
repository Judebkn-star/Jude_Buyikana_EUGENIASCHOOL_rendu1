#!/bin/bash
# Tous les tests hors n8n (aucun appel Gemini). Code de sortie non nul au premier échec.
set -e
cd "$(dirname "$0")/.."
node tests/run-structure.mjs
node tests/run-books.mjs
node tests/run-select.mjs
node tests/run-quotes.mjs

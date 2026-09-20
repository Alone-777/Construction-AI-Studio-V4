#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "CONSTRUCTION AI STUDIO"
echo "Raiz: $ROOT"
echo "Iniciando backend + painel..."
echo

exec npm run ligar

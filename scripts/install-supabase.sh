#!/usr/bin/env bash
set -euo pipefail
# CLI is a development tool, outside browser dependencies. Curl honors the session proxy and CA trust.
market_cli_version=2.83.0
market_os="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$(uname -m)" in x86_64) market_arch=amd64 ;; aarch64|arm64) market_arch=arm64 ;; *) echo 'Unsupported CPU; install Supabase CLI using official instructions.' >&2; exit 1 ;; esac
case "$market_os" in linux|darwin) ;; *) echo 'Unsupported OS; install Supabase CLI using official instructions.' >&2; exit 1 ;; esac
market_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
market_tmp="$(mktemp -d)"
trap 'rm -rf "$market_tmp"' EXIT
market_archive="supabase_${market_os}_${market_arch}.tar.gz"
market_release="https://github.com/supabase/cli/releases/download/v${market_cli_version}"
curl -fLsS "${market_release}/${market_archive}" -o "${market_tmp}/${market_archive}"
curl -fLsS "${market_release}/supabase_${market_cli_version}_checksums.txt" -o "${market_tmp}/checksums.txt"
awk -v name="$market_archive" '$2 == name { print; found=1 } END { if (!found) exit 1 }' "${market_tmp}/checksums.txt" > "${market_tmp}/selected.checksum"
(cd "$market_tmp" && if command -v sha256sum >/dev/null; then sha256sum -c selected.checksum; else shasum -a 256 -c selected.checksum; fi)
mkdir -p "${market_root}/.tools"
tar -xzf "${market_tmp}/${market_archive}" -C "${market_root}/.tools" supabase
"${market_root}/.tools/supabase" --version

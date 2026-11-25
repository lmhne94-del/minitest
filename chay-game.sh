#!/bin/sh
cd "$(dirname "$0")"
echo "Mo trinh duyet tai http://localhost:8000/survival.html"
(xdg-open http://localhost:8000/survival.html || open http://localhost:8000/survival.html) >/dev/null 2>&1 &
python3 -m http.server 8000

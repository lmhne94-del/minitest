@echo off
cd /d "%~dp0"
echo Mo trinh duyet tai http://localhost:8000/survival.html
start http://localhost:8000/survival.html
python -m http.server 8000 || py -m http.server 8000

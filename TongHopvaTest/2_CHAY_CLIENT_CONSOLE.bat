@echo off
chcp 65001 >nul
title [MAY KHACH] TCP Socket Client (Python Console)
echo ======================================================================
echo    KHOI CHAY PYTHON TCP SOCKET CLIENT KET NOI PORT 8080
echo ======================================================================
cd /d "%~dp0"
python client/tcp_client.py
pause

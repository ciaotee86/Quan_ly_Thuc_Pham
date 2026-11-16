@echo off
chcp 65001 >nul
title [MAY CHU] TCP Socket Server - Quan Ly Thuc Pham & FEFO (Port 8080)
echo ======================================================================
echo    KHOI DONG MAY CHU TCP SOCKET THUAN VA CSDL SQLITE (PORT 8080)
echo ======================================================================
cd /d "%~dp0"
python server/tcp_server.py
pause

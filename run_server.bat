@echo off
chcp 65001 >nul
title May Chu TCP Socket Quan Ly Thuc Pham - Port 8080
echo ======================================================================
echo    KHOI DONG MAY CHU TCP SOCKET THUAN & CSDL SQLITE (PORT 8080)
echo ======================================================================
cd /d "%~dp0"
python server/database.py
pause

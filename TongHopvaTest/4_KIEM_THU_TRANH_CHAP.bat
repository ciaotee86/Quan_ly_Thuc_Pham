@echo off
chcp 65001 >nul
title [KIEM THU] Kich Ban Tranh Chap Mang Da Luong (Concurrency Stress Test)
echo ======================================================================
echo    KHOI CHAY KIEM THU TRANH CHAP 20 LUONG CLIENT QUA SOCKET TCP
echo ======================================================================
cd /d "%~dp0"
python tests/stress_test_concurrency.py
pause

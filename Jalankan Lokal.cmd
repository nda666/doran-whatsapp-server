@echo off
cd /d "%~dp0"
title Doran WA Local
"%~dp0storage\local\runtime\node.exe" deployment\start-local.cjs
if errorlevel 1 pause

@echo off
rem Double-click to run DANS for a presentation on the local network (see present.ps1 and README.md).
rem Options are passed on, for example:  present.cmd -Reset
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0present.ps1" %*
pause

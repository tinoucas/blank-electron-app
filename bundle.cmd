@echo off
rem Usage: bundle.cmd ^<url^> [--icon ^<file^|url^>] [--skip-check]   (see --help)
node "%~dp0scripts\bundle.js" %*

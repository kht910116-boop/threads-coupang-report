@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title AutoTube Studio

echo.
echo   AutoTube Studio
echo   ==================================================
echo.

REM ── 1. Node.js 확인 ────────────────────────────────────────
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js가 설치돼 있지 않습니다.
  echo.
  echo       브라우저를 열어드릴 테니 LTS 버전을 받아 설치한 뒤
  echo       이 파일을 다시 실행하세요.
  echo.
  start https://nodejs.org/ko/download
  pause
  exit /b 1
)

REM 버전이 20 미만이면 Next.js가 안 돈다.
for /f "tokens=1 delims=." %%v in ('node -v') do set NODEMAJOR=%%v
set NODEMAJOR=!NODEMAJOR:v=!
if !NODEMAJOR! LSS 20 (
  for /f %%v in ('node -v') do echo   [X] Node.js %%v 는 너무 낮습니다. 20 이상이 필요합니다.
  echo.
  start https://nodejs.org/ko/download
  pause
  exit /b 1
)
for /f %%v in ('node -v') do echo   [O] Node.js %%v

REM ── 2. 패키지 설치 (처음 한 번만) ──────────────────────────
if not exist "node_modules" (
  echo   [ ] 처음 실행이라 필요한 파일을 받습니다. 1~3분 걸립니다...
  call npm install
  if errorlevel 1 (
    echo.
    echo   [X] 설치에 실패했습니다. 위 메시지를 그대로 복사해 알려주세요.
    pause
    exit /b 1
  )
)
echo   [O] 준비 완료

REM ── 3. Claude Code 확인 (없어도 앱은 뜬다) ────────────────
where claude >nul 2>nul
if errorlevel 1 (
  echo   [!] Claude Code가 없습니다. 대본 생성이 안 됩니다.
  echo       나중에 터미널에서 claude 를 실행해 /login 하세요.
) else (
  echo   [O] Claude Code
)

REM ── 4. 서버 시작 ───────────────────────────────────────────
echo.
echo   브라우저가 곧 열립니다. 이 창은 닫지 마세요.
echo   종료하려면 이 창에서 Ctrl+C 를 누르세요.
echo.
start "" http://localhost:3000
call npm run dev

pause

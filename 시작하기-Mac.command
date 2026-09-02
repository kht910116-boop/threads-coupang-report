#!/bin/bash
# 더블클릭으로 실행됩니다.
# "실행할 수 없음"이라고 뜨면 터미널에서 아래를 한 번 실행하세요:
#   chmod +x "시작하기-Mac.command"

cd "$(dirname "$0")" || exit 1

echo
echo "  AutoTube Studio"
echo "  =================================================="
echo

# ── 1. Node.js 확인 ──────────────────────────────────────────
# 더블클릭으로 열린 터미널은 PATH가 좁아서, 흔한 설치 위치를 미리 넣어준다.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "  [X] Node.js가 설치돼 있지 않습니다."
  echo
  echo "      브라우저를 열어드릴 테니 LTS 버전을 받아 설치한 뒤"
  echo "      이 파일을 다시 실행하세요."
  echo
  open "https://nodejs.org/ko/download"
  read -r -p "  엔터를 누르면 닫힙니다."
  exit 1
fi

# 버전이 20 미만이면 Next.js가 안 돈다.
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  [X] Node.js $(node -v) 는 너무 낮습니다. 20 이상이 필요합니다."
  echo
  open "https://nodejs.org/ko/download"
  read -r -p "  엔터를 누르면 닫힙니다."
  exit 1
fi
echo "  [O] Node.js $(node -v)"

# ── 2. 패키지 설치 (처음 한 번만) ────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "  [ ] 처음 실행이라 필요한 파일을 받습니다. 1~3분 걸립니다..."
  if ! npm install; then
    echo
    echo "  [X] 설치에 실패했습니다. 위 메시지를 그대로 복사해 알려주세요."
    read -r -p "  엔터를 누르면 닫힙니다."
    exit 1
  fi
fi
echo "  [O] 준비 완료"

# ── 3. Claude Code 확인 (없어도 앱은 뜬다) ──────────────────
if command -v claude >/dev/null 2>&1; then
  echo "  [O] Claude Code"
else
  echo "  [!] Claude Code가 없습니다. 대본 생성이 안 됩니다."
  echo "      나중에 터미널에서 claude 를 실행해 /login 하세요."
fi

# ── 4. 서버 시작 ─────────────────────────────────────────────
echo
echo "  브라우저가 곧 열립니다. 이 창은 닫지 마세요."
echo "  종료하려면 이 창에서 Control+C 를 누르세요."
echo

# 서버가 뜬 뒤에 열어야 빈 화면이 안 뜬다.
( sleep 4; open "http://localhost:3000" ) &

npm run dev

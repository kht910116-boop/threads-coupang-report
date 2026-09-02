# AutoTube Studio

스타일 프리셋으로 유튜브 영상을 기획하고, 에셋을 뽑아, **캡컷 프로젝트로 넘기는** 개인용 로컬 도구.

주제 한 줄 + 스타일 하나를 고르면 이게 나온다:

- **대본 구성** — 훅부터 마무리까지, 컷 단위로 쪼개진 나레이션
- **컷별 이미지 설명** — 왜 이 그림이 이 컷에 붙는지
- **이미지 프롬프트** — 생성기에 그대로 넣는 영문 프롬프트
- **스토리보드** — 컷 순서·시작 시각·길이·전환 (컷편집용)
- **이미지 / 영상 / 음성** — 키가 꽂힌 서비스로 자동 생성
- **캡컷 드래프트** — 컷이 다 잘려서 타임라인에 얹힌 상태로

## 핵심: 스타일이 핏을 잠근다

스타일(프리셋)을 고르는 순간 아래가 전부 고정된다. 그래서 매번 같은 핏으로 나온다.

```
스타일
 ├─ 화면비 · fps · 목표 길이 · 컷 길이 범위
 ├─ 화자 · 말투 · 구성 뼈대 · 금지 사항 · 글자수
 ├─ 고정 화풍 프롬프트 (모든 컷 이미지 뒤에 붙는다)
 ├─ 컷 기본 모드 (이미지+줌 / AI 영상) · 켄번즈 · 전환
 ├─ TTS 서비스 · 목소리 · 속도 · 피치
 └─ 자막 내용 · 위치 · 크기
```

기본 프리셋 4개(쇼츠 이슈 훅형 / 정보 롱폼 / 감성 브이로그 / 애니메이션 스토리텔링)가 들어 있고,
**화면에서 얼마든지 복제·수정·추가**할 수 있다. 프리셋은 `data/presets.json`에 쌓인다.

## 시작하기

```bash
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:3000
```

### 기획 엔진: 구독 CLI

**API 키가 필요 없다.** 구독 요금제는 API 키를 주지 않지만, 구독 CLI는 구독 로그인으로
돈다. 그래서 이 앱은 API 대신 로컬 CLI 바이너리를 호출한다.

```bash
claude          # 실행 후 /login 으로 구독 계정 로그인 (한 번만)
npm run dev     # .env.local을 비워둬도 기획이 돌아간다
```

**CLI는 코드가 아니라 설정으로 붙인다.** CLI마다 플래그가 다르므로 러너는 CLI 이름을
하나도 모르고, `data/agents.json`(연결 상태 화면에서 편집 가능)이 전부 결정한다.

```jsonc
{
  "id": "claude",
  "command": "claude",
  "args": ["-p", "--system-prompt", "{{system}}",
           "--json-schema", "{{schema}}",
           "--output-format", "json", "--tools", "", "--strict-mcp-config"],
  "promptVia": "stdin",      // stdin | arg
  "supportsSchema": true,    // false면 스키마를 시스템 프롬프트에 글로 넣는다
  "resultPath": "result"     // JSON 봉투 안 경로. 비우면 stdout 전체
}
```

자리표시자는 `{{system}}` `{{user}}` `{{schema}}` 셋뿐이고, 값이 비는 자리표시자는
짝이 되는 앞 플래그까지 같이 빠진다. 스키마 플래그가 없는 CLI, 시스템 프롬프트 자리가
없는 CLI도 자동으로 처리된다 (스키마는 프롬프트에 글로, 시스템은 사용자 프롬프트에 병합).

기본 항목으로 `claude`(검증 완료), `codex`·`grok`·`antigravity`(**플래그 미검증 초안**)가
들어 있다. 미검증 항목은 실제 플래그에 맞게 고쳐야 하고, 안 쓰면 지우면 된다.

설치된 것을 목록 위에서부터 찾아 쓴다. `PLANNER_AGENT=<id>`로 고정할 수 있다
(종량제 API는 `api`).

**주의**: 구독에는 사용량 한도가 있다. 한 편 기획에 2~3분, 롱폼은 더 걸리므로
하루에 수십 편을 몰아 돌리면 한도에 닿을 수 있다.

### 붙는 서비스

| 단계 | 서비스 | 구독제로 되나 | 환경변수 |
|---|---|---|---|
| 기획·대본 | Claude Code CLI | ✅ Pro/Max 구독으로 동작 | (없음, `/login`) |
| 기획·대본 | Anthropic API | ❌ 종량제 별도 | `ANTHROPIC_API_KEY` |
| 음성 | ElevenLabs | 플랜에 API 쿼터 포함 (본인 플랜 확인 필요) | `ELEVENLABS_API_KEY` |
| 음성 | 타입캐스트 | 플랜별로 다름 (확인 필요) | `TYPECAST_API_KEY` |
| 음성 | Google AI Studio (Gemini TTS) | AI Studio에서 무료 키 발급 | `GOOGLE_AI_STUDIO_API_KEY` |
| 음성 | Google Cloud TTS | 클라우드 종량제 | `GOOGLE_CLOUD_TTS_API_KEY` |
| 이미지 | Gemini 이미지 | AI Studio 키 | `GEMINI_IMAGE_API_KEY` |
| 이미지 | OpenAI | ❌ ChatGPT Plus는 API 미포함 | `OPENAI_API_KEY` |
| 영상 | Google Veo | 종량제 | `GEMINI_VIDEO_API_KEY` |

**구독만 쓰고 API를 안 붙일 거면** 이미지·영상은 '직접 넣기' 모드로 두면 된다.
앱이 컷별 프롬프트를 뽑아주니, 구독 중인 웹 서비스에 붙여넣고 나온 결과물을 컷에 업로드하면
나머지(타임라인·자막·캡컷 내보내기)는 그대로 돌아간다. 이게 기본 동작이다.

**연결 상태** 화면에서 어떤 엔진·키가 준비됐는지 보이고, ElevenLabs·Google Cloud는
목소리 목록을 바로 불러와 voice id를 복사할 수 있다.

## 작업 흐름

1. **프로젝트** 화면에서 주제 + 스타일 선택 → 만들기
2. **기획 만들기** — 1~3분. 대본·컷·프롬프트·스토리보드가 한 번에 나온다
3. 컷을 손본다 — 나레이션·자막·프롬프트 수정, 컷별로 이미지/AI영상 전환, 마음에 드는 컷은 **잠금**
   (잠근 컷은 기획을 다시 만들어도 살아남는다)
4. **이미지 / 음성 / 영상 만들기** — 아직 없는 컷만 채운다. 여러 번 눌러도 안전하다
5. **캡컷으로 내보내기**

## 내보내기 결과

```
data/exports/<프로젝트>/<제목>/
  capcut/           캡컷 드래프트 (폴더째 캡컷 프로젝트 폴더로 복사)
  assets/           컷 순서대로 번호 붙은 이미지·영상·음성 (001-img.png …)
  subtitles.srt     타이밍 맞는 자막
  shotlist.csv      컷별 시작 시각·길이·프롬프트 (엑셀에서 바로 열린다)
  script.md         대본 + 이미지 설명 + 스토리보드
  plan.json         원본 기획 데이터
  README.txt        이 폴더 쓰는 법
```

`CAPCUT_DRAFT_DIR`을 설정해두면 내보낼 때 캡컷 프로젝트 폴더까지 자동으로 복사한다.

### ⚠️ 캡컷 드래프트에 대해 알아둘 것

캡컷의 `draft_content.json` 형식은 **공개 문서가 없고 앱 버전마다 달라진다.**
여기 들어 있는 생성기는 알려진 구조를 따라 만든 최선의 추정이고, 설치된 캡컷 버전에 따라
드래프트가 안 열릴 수 있다. 아직 실제 캡컷 앱에서 열어본 검증은 하지 않았다.

그래서 내보내기는 **항상 두 벌**을 만든다. 드래프트가 안 열려도 `assets/` + `subtitles.srt` +
`shotlist.csv`로 어떤 편집기에서든 그대로 작업할 수 있다. 번호 순서대로 올리고 SRT를 얹으면 끝이다.

드래프트가 안 열리면 캡컷 버전을 알려주면 형식을 맞출 수 있다.

## 확장하기

**프리셋 추가** — 화면에서 만들면 된다. 코드로 기본값을 추가하려면
`src/lib/presets/defaults.ts` 배열에 항목을 넣으면 다음 실행 때 합류한다
(기존 프리셋은 덮어쓰지 않는다).

**TTS 서비스 추가** — 세 단계면 된다.

1. `src/lib/providers/tts/<이름>.ts`에 `TtsProvider` 구현
2. `src/lib/types.ts`의 `TTS_PROVIDERS`에 id 추가
3. `src/lib/providers/tts/index.ts`의 `TTS_ADAPTERS` 배열에 넣기

이미지·영상도 같은 구조다 (`src/lib/providers/image.ts`, `video.ts`).

## 구조

```
src/lib/
  types.ts              전체 데이터 계약 (프리셋·기획·프로젝트)
  engine/               기획 엔진 — 주제+프리셋 → 컷 단위 기획서
    prompt.ts             두 경로가 공유하는 프롬프트
    cli.ts                Claude Code CLI 경유 (구독제)
    api.ts                Anthropic SDK 경유 (종량제)
    index.ts              둘 중 하나 자동 선택
  store.ts              파일 기반 저장소
  providers/tts/        TTS 어댑터 4종 + 등록소
  providers/image.ts    이미지 어댑터
  providers/video.ts    영상 어댑터
  export/capcut.ts      캡컷 드래프트 생성기
  export/bundle.ts      내보내기 번들 (드래프트 + 범용 산출물)
src/app/                UI + API 라우트
data/                   프로젝트·프리셋·에셋 (gitignore)
```

## 검증 상태

| 부분 | 상태 |
|---|---|
| 구독제 경로 (Claude Code CLI) 실제 기획 생성 | 통과 — 18컷 / 44.5초, 프리셋 제약 전부 준수 |
| 기획 → 컷 → 내보내기 전 경로 | 통과 (에셋이 빠진 컷이 있어도 타임라인과 SRT 시각이 일치) |
| 프리셋 CRUD, 파일 업로드, 에셋 서빙 | 통과 |
| 종량제 경로 (Anthropic API) | **미검증** — API 키가 없어 확인 못 함 |
| 캡컷 드래프트가 실제 캡컷에서 열리는지 | **미검증** — 위 경고 참고 |
| ElevenLabs / 타입캐스트 / Gemini TTS / Google Cloud TTS 실제 호출 | **미검증** — 각 서비스 키가 있어야 확인 가능 |
| 이미지·영상 생성 실제 호출 | **미검증** — 같은 이유 |

어댑터는 각 서비스의 알려진 API 형태에 맞춰 구현했지만 실제 계정으로 한 번씩 눌러봐야 한다.
엔드포인트가 다르면 `TYPECAST_API_BASE` 같은 환경변수로 덮어쓰거나 어댑터 파일 한 개만 고치면 된다.

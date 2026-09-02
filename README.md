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
cp .env.example .env.local   # 키 채우기
npm run dev                  # http://localhost:3000
```

**필수는 `ANTHROPIC_API_KEY` 하나뿐이다.** 나머지는 쓰는 것만 채우면 된다.
비워두면 그 단계는 '직접 넣기' 모드가 되어, 프롬프트만 뽑아주고 결과물은 직접 올리면 된다.

## 붙는 서비스

| 단계 | 서비스 | 환경변수 |
|---|---|---|
| 기획·대본 | Claude (Opus 5) | `ANTHROPIC_API_KEY` |
| 음성 | ElevenLabs | `ELEVENLABS_API_KEY` |
| 음성 | 타입캐스트 | `TYPECAST_API_KEY`, `TYPECAST_API_BASE` |
| 음성 | Google AI Studio (Gemini TTS) | `GOOGLE_AI_STUDIO_API_KEY` |
| 음성 | Google Cloud TTS | `GOOGLE_CLOUD_TTS_API_KEY` |
| 이미지 | Gemini 이미지 | `GEMINI_IMAGE_API_KEY` |
| 이미지 | OpenAI | `OPENAI_API_KEY` |
| 영상 | Google Veo | `GEMINI_VIDEO_API_KEY` |

**연결 상태** 화면에서 어떤 키가 꽂혔는지 보이고, ElevenLabs·Google Cloud는 목소리 목록을
바로 불러와 voice id를 복사할 수 있다.

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
  claude.ts             기획 엔진 — 주제+프리셋 → 컷 단위 기획서
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
| 기획 → 컷 → 내보내기 전 경로 | 통과 (에셋이 빠진 컷이 있어도 타임라인과 SRT 시각이 일치) |
| 프리셋 CRUD, 파일 업로드, 에셋 서빙 | 통과 |
| 캡컷 드래프트가 실제 캡컷에서 열리는지 | **미검증** — 위 경고 참고 |
| ElevenLabs / 타입캐스트 / Gemini TTS / Google Cloud TTS 실제 호출 | **미검증** — 각 서비스 키가 있어야 확인 가능 |
| 이미지·영상 생성 실제 호출 | **미검증** — 같은 이유 |

어댑터는 각 서비스의 알려진 API 형태에 맞춰 구현했지만 실제 계정으로 한 번씩 눌러봐야 한다.
엔드포인트가 다르면 `TYPECAST_API_BASE` 같은 환경변수로 덮어쓰거나 어댑터 파일 한 개만 고치면 된다.

/**
 * 그림체 목록.
 *
 * 프리셋 편집 화면이 이 목록을 카드로 깔아준다. 화풍은 영문 프롬프트 한 덩어리라
 * 빈 칸에 직접 쓰라고 하면 아무도 못 쓴다 — 골라 쓰게 하고, 필요하면 고치게 한다.
 *
 * 프리셋의 image.prefix가 여기 prompt를 그대로 쓰므로 출처가 하나다.
 * 새 그림체를 붙이려면 여기 항목만 늘리면 된다.
 */

export interface ArtStyle {
  id: string;
  /** 카드에 뜨는 이름 */
  name: string;
  /** 카드에 뜨는 한국어 설명. 영문 프롬프트를 읽지 않아도 고를 수 있게 한다. */
  note: string;
  /** 이미지 프롬프트 앞에 붙는 영문 화풍 문구 */
  prompt: string;
}

export const ART_STYLES: ArtStyle[] = [
  {
    id: "sketch-spotlight",
    name: "스케치 스포트라이트",
    note: "손그림 잉크선에 수채 워시. 세피아 화면에 핵심 하나만 선명한 색으로 살린다.",
    prompt:
      "Hand-drawn minimalist sketch style, whiteboard animation aesthetic, clean ink linework with soft watercolor wash, muted sepia and earth-tone palette, warm aged paper texture background, simple stick-figure characters with round heads, dot eyes and contextual clothing, detailed architectural backgrounds in loose watercolor with isometric perspective, editorial documentary illustration feel, one key focal object per scene in vivid saturated color as a dramatic spotlight against the muted sepia",
  },
  {
    id: "editorial-news",
    name: "에디토리얼 뉴스",
    note: "자연광 다큐 사진에 지도·도표를 얹은 절제된 신문 지면 느낌.",
    prompt:
      "Restrained editorial news look, natural documentary photography, muted neutral palette with one signal colour, even daylight, clean map and chart motifs worked into the frame, broadsheet newspaper feel",
  },
  {
    id: "product-magazine",
    name: "제품 매거진",
    note: "무배경 스튜디오 제품 컷. 회색 바탕에 강조색 하나, 깨끗한 하이라이트.",
    prompt:
      "Crisp product-magazine look, high-key studio photography on a seamless backdrop, one bright saturated accent against neutral grey, soft large-source light with clean specular highlights, tidy side-by-side arrangements",
  },
  {
    id: "manual-flat",
    name: "매뉴얼 플랫",
    note: "흰 바탕 플랫 벡터. 지금 단계만 강조색, 큼직한 아이콘과 콜아웃.",
    prompt:
      "Clean instructional manual look, flat vector illustration with soft drop shadows, bright white ground, a single accent colour marking the current step, oversized simple icons and callout circles, calm and uncluttered",
  },
  {
    id: "corporate-doc",
    name: "비즈니스 다큐",
    note: "네이비·웜그레이 톤의 정제된 기업 다큐. 유리와 강철의 오피스.",
    prompt:
      "Polished corporate documentary look, clean editorial photography and product renders, deep navy and warm grey palette, soft studio key light with a subtle rim, glass-and-steel office interiors, restrained data overlays, premium business magazine feel",
  },
  {
    id: "forensic-archive",
    name: "탐사 기록",
    note: "저채도 기록사진, 차가운 블루그레이에 앰버 하나. 증거판과 시간선.",
    prompt:
      "Investigative documentary look, desaturated archival photography, cold blue-grey palette with a single amber accent, hard directional light and deep shadow, fine grain and slight vignette, evidence-board and timeline motifs, sombre forensic mood",
  },
  {
    id: "news-alert",
    name: "속보 그래픽",
    note: "다큐 사진 위 강렬한 적·흑 대비. 속보 경보 같은 긴박한 세로 화면.",
    prompt:
      "High-contrast news-graphic look, bold saturated red and black over documentary photography, hard light, heavy vignette, urgent broadcast-alert energy, vertical composition with one clear centre subject",
  },
  {
    id: "bold-infographic",
    name: "볼드 인포그래픽",
    note: "색 블록 위 플랫 도형. 큰 숫자를 디자인 요소로 쓰는 세로 화면.",
    prompt:
      "Bold infographic look, flat geometric shapes, oversized numerals used as design elements, bright primary palette on solid colour blocks, thick clean outlines, playful and instantly readable, vertical composition",
  },
  {
    id: "edu-animation",
    name: "교육 애니메이션",
    note: "둥근 도형의 2D 도식, 파스텔 톤, 분필과 종이 질감.",
    prompt:
      "Friendly educational animation look, simple 2D diagrams with rounded shapes, warm pastel palette, soft even light, one object in clear close-up per frame, chalk-and-paper texture, curious and approachable",
  },
  {
    id: "deal-commerce",
    name: "초특가 커머스",
    note: "단색 바탕 제품 클로즈업. 강한 하이라이트와 빨강·노랑 강조.",
    prompt:
      "High-impact commerce look, product close-up on a bold solid colour ground, hard punchy light with a strong specular highlight, hot red and yellow accents, price-tag and starburst motifs, vertical composition",
  },
  {
    id: "phone-ugc",
    name: "폰카 실사용",
    note: "핸드헬드 스마트폰 질감. 창가 자연광, 손이 들어와 직접 보여준다.",
    prompt:
      "Authentic smartphone-shot look, handheld framing, ordinary home or desk surroundings, natural window light with a mild colour cast, slight lens softness, hands entering frame to demonstrate, unpolished and believable, vertical composition",
  },
  {
    id: "review-studio",
    name: "리뷰 스튜디오",
    note: "중성 무배경에 부드러운 두 광원. 회색·우드 톤의 차분한 테스트 벤치.",
    prompt:
      "Clean review-studio look, product on a neutral seamless backdrop, soft two-source lighting with a gentle shadow, calm grey-and-wood palette, measured test-bench arrangements, trustworthy and understated",
  },
  {
    id: "highlight-reel",
    name: "하이라이트 릴",
    note: "채도 높은 실사에 순위 뱃지. 스포츠 중계 같은 에너지.",
    prompt:
      "Punchy highlight-reel look, vivid documentary photography, high saturation and contrast, bold rank-badge and bracket motifs in a single accent colour, energetic sports-broadcast feel",
  },
  {
    id: "dark-recap",
    name: "다크 리캡",
    note: "어두운 바탕의 저채도 자료 화면. 차가운 강조색과 타임라인.",
    prompt:
      "Stark recap look, desaturated documentary imagery on a dark ground, one cold accent colour, timeline and marker motifs, heavy contrast so it stays legible small, vertical composition, tense and matter-of-fact",
  },
  {
    id: "split-reaction",
    name: "분할 리액션",
    note: "분할 화면의 표정·손 클로즈업. 밝고 빠른 팝업 만화 느낌.",
    prompt:
      "Split-frame reaction look, vivid candid photography, exaggerated close-ups of faces and hands, bright high-energy palette, comic pop-out and burst motifs, fast and playful, vertical composition",
  },
  {
    id: "soft-film",
    name: "감성 필름",
    note: "얕은 심도의 감성 사진. 여백이 많고 빛이 부드럽다.",
    prompt:
      "35mm film photograph, visible grain, soft diffused window light, desaturated pastel palette, generous negative space, quiet everyday scene, natural candid framing",
  },
];

/** 프롬프트로 그림체를 되짚는다. 프리셋이 고른 카드를 표시하는 데 쓴다. */
export const artStyleOf = (prompt: string): ArtStyle | undefined =>
  ART_STYLES.find((s) => s.prompt === prompt.trim());

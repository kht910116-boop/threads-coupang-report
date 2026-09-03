/**
 * 읽는 방식 교정.
 *
 * TTS는 숫자와 영문을 제 마음대로 읽는다. "1,030억 원"을 "일 쉼표 영삼영 억 원"으로
 * 읽거나 통째로 건너뛴다. 그래서 **자막에 보이는 글자**와 **읽어줄 글자**를 갈라야
 * 한다. 자막은 "1,030억 원"이 맞고, 음성은 "천삼십억 원"이 맞다.
 *
 * 규칙으로 푼다. AI에게 시키지 않는 이유는 셋이다.
 *   - 한국어 수 읽기는 규칙이 정해져 있다. 맞히는 문제가 아니다.
 *   - 455줄을 AI에 넣으면 구독 사용량을 쓰고 몇 분이 걸린다. 규칙은 즉시다.
 *   - 같은 대본을 두 번 돌리면 같은 결과가 나와야 한다.
 *
 * 대신 **사람이 마지막에 본다.** 이 파일은 제안만 만들고, 화면이 바뀐 줄만 모아
 * 보여준다. 고유명사나 말맛은 기계가 알 수 없다.
 */

const SINO = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const NATIVE = [
  "", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열",
];
const NATIVE_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];

/**
 * 고유어로 세는 단위.
 *
 * "3개"는 '세 개'지, '삼 개'가 아니다. 반대로 "3월"은 '삼 월'이다. 이 구분을
 * 틀리면 듣는 사람이 바로 알아챈다. 목록에 없는 단위는 한자어로 읽는다 —
 * 한자어 쪽이 훨씬 많기 때문이다.
 */
const NATIVE_COUNTERS = [
  "개", "명", "사람", "마리", "번", "가지", "대", "권", "장", "살", "시", "달",
  "군데", "채", "켤레", "그루", "송이", "자루", "벌", "쌍", "판", "통", "잔", "병",
];

/** 4자리 한 덩이를 한자어로 읽는다. 1030 → 천삼십 */
function readGroup(value: number): string {
  const units = ["", "십", "백", "천"];
  const digits = String(value).split("").map(Number).reverse();
  let out = "";
  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = digits[i];
    if (digit === 0) continue;
    // 십·백·천 앞의 '일'은 말하지 않는다. '일천삼십'이 아니라 '천삼십'이다.
    out += (digit === 1 && i > 0 ? "" : SINO[digit]) + units[i];
  }
  return out;
}

/** 한자어 수 읽기. 0 이상의 정수만 받는다. */
export function sinoNumber(value: number): string {
  if (value === 0) return "영";
  const groups = ["", "만", "억", "조", "경"];
  const parts: string[] = [];
  let rest = value;
  let g = 0;
  while (rest > 0 && g < groups.length) {
    const group = rest % 10000;
    if (group > 0) {
      // 1만은 '만'이라고 하지만 1억은 '일억'이라고 한다.
      const head = group === 1 && g === 1 ? "" : readGroup(group);
      parts.unshift(head + groups[g]);
    }
    rest = Math.floor(rest / 10000);
    g++;
  }
  return parts.join(" ");
}

/** 고유어 수 읽기. 1~99만 된다 — 그 위는 한국어에서도 한자어로 센다. */
function nativeNumber(value: number): string | null {
  if (value < 1 || value > 99) return null;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  if (tens === 0) return NATIVE[ones];
  return NATIVE_TENS[tens] + (ones > 0 ? NATIVE[ones] : "");
}

/**
 * 기호·약어를 소리로.
 *
 * 여기 없는 것은 건드리지 않는다. 모르는 걸 추측해서 바꾸면 사람이 검수할 때
 * 무엇이 왜 바뀌었는지 알 수 없어진다.
 */
const SYMBOLS: Array<[RegExp, string]> = [
  [/％|%/g, " 퍼센트"],
  [/‰/g, " 퍼밀"],
  [/₩/g, "원 "],
  [/\$/g, "달러 "],
  [/€/g, "유로 "],
  [/¥/g, "엔 "],
  [/㎡|m2/g, " 제곱미터"],
  [/㎢/g, " 제곱킬로미터"],
  [/℃|°C/g, " 도"],
  [/㎏|(?<=\d)kg/gi, " 킬로그램"],
  [/㎞|(?<=\d)km/gi, " 킬로미터"],
  [/(?<=\d)cm/gi, " 센티미터"],
  [/(?<=\d)mm/gi, " 밀리미터"],
  [/(?<=\d)ml/gi, " 밀리리터"],
  [/(?<=\d)GB/g, " 기가바이트"],
  [/(?<=\d)MB/g, " 메가바이트"],
  [/(?<=\d)TB/g, " 테라바이트"],
];

/** 영문 약어를 한글 소리로. 사용자가 data/pronunciation.json으로 더 넣을 수 있다. */
const ALPHABET: Record<string, string> = {
  A: "에이", B: "비", C: "씨", D: "디", E: "이", F: "에프", G: "지", H: "에이치",
  I: "아이", J: "제이", K: "케이", L: "엘", M: "엠", N: "엔", O: "오", P: "피",
  Q: "큐", R: "알", S: "에스", T: "티", U: "유", V: "브이", W: "더블유",
  X: "엑스", Y: "와이", Z: "지",
};

export type Rule = { find: string; replace: string; note?: string };

/**
 * 한 줄을 읽을 수 있는 글자로 바꾼다.
 *
 * 순서가 중요하다. 사용자 규칙을 맨 앞에 두는 이유는, 기계가 손대기 전에
 * 사람이 정한 것을 먼저 적용해야 하기 때문이다 — "1,030억"을 통째로 다르게
 * 읽히고 싶을 때 숫자 규칙이 먼저 물면 기회가 없다.
 */
export function toSpoken(text: string, rules: Rule[] = []): string {
  let out = text;

  for (const rule of rules) {
    if (!rule.find) continue;
    out = out.split(rule.find).join(rule.replace);
  }

  // 자릿점은 읽기 전에 뗀다. "1,030"이 "1"과 "030"으로 갈리면 안 된다.
  out = out.replace(/(?<=\d),(?=\d{3}\b)/g, "");

  // 큰 수 접미(만·억·조)가 붙은 숫자. "1030억" → "천삼십억"
  out = out.replace(/(\d+)\s*(조|억|만)/g, (_, digits: string, unit: string) => {
    const n = Number(digits);
    return Number.isSafeInteger(n) ? `${sinoNumber(n)}${unit}` : `${digits}${unit}`;
  });

  // 소수. "1.1" → "일 점 일". 소수점 아래는 한 자리씩 읽는다.
  out = out.replace(/(\d+)\.(\d+)/g, (_, whole: string, frac: string) => {
    const n = Number(whole);
    const head = Number.isSafeInteger(n) ? sinoNumber(n) : whole;
    return `${head} 점 ${frac.split("").map((d) => SINO[Number(d)]).join(" ")}`;
  });

  out = SYMBOLS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), out);

  // 고유어로 세는 단위가 뒤에 붙은 숫자. "3개" → "세 개"
  //
  // 단위 뒤에 아무 한글이나 와도 된다고 하면 "2달러"의 '달'을 단위로 잡아
  // "두 달러"가 된다. 그렇다고 한글을 다 막으면 "3개와"의 '와' 때문에 못 잡는다 —
  // 조사는 늘 붙어 나오기 때문이다. 그래서 **뒤에 올 수 있는 것을 적어둔다.**
  const PARTICLES =
    "가|이|은|는|을|를|에|의|로|와|과|도|만|씩|나|째|간|짜리|어치|부터|까지|밖에|정도|이상|이하";
  const nativePattern = new RegExp(
    `(\\d+)\\s*(${NATIVE_COUNTERS.join("|")})(?=$|[^가-힣]|${PARTICLES})`,
    "g",
  );
  out = out.replace(nativePattern, (whole, digits: string, counter: string) => {
    const spoken = nativeNumber(Number(digits));
    return spoken ? `${spoken} ${counter}` : whole;
  });

  // 남은 숫자는 한자어로. 연도·전화번호처럼 자리마다 읽어야 하는 것도 있지만,
  // 그건 사람이 볼 자리다 — 기계는 가장 흔한 쪽으로 찍는다.
  out = out.replace(/\d+/g, (digits) => {
    const n = Number(digits);
    return Number.isSafeInteger(n) ? sinoNumber(n) : digits;
  });

  // 영문 약어(대문자 2~5자)를 한 글자씩 소리로. 낱말은 건드리지 않는다.
  out = out.replace(/\b[A-Z]{2,5}\b/g, (word) =>
    word.split("").map((ch) => ALPHABET[ch] ?? ch).join(""),
  );

  return out.replace(/\s{2,}/g, " ").trim();
}

/** 자막에 보이는 글자와 읽어줄 글자가 다른지. 같으면 검수할 것이 없다. */
export function needsReview(text: string, spoken: string): boolean {
  return text.trim() !== spoken.trim();
}

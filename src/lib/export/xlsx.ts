import zlib from "node:zlib";

/**
 * 최소한의 xlsx 쓰기.
 *
 * 라이브러리를 안 쓴 이유는 두 가지다. 첫째, 이 앱은 electron-builder로 포장되는데
 * `node_modules`를 standalone 트리에 넣는 문제로 이미 한 번 앱이 창도 못 띄우고
 * 죽었다. 의존성을 늘릴수록 그 위험이 커진다. 둘째, 우리가 쓸 기능이 '문자열 표
 * 한 장'뿐이다 — 서식도 수식도 없다. 그 정도는 직접 쓰는 게 더 안전하다.
 *
 * 레퍼런스 사이트가 주는 파일과 같은 모양으로 맞췄다(SheetJS 출력, sharedStrings
 * 없이 인라인 문자열). 사용자가 두 파일을 섞어 써도 구분되지 않아야 한다.
 */

type Column = { header: string; width: number };
type Cell = string | number;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // 엑셀은 XML 1.0 제어문자를 못 읽는다. 프롬프트에 섞여 들어오면 파일이 안 열린다.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const columnName = (index: number): string => {
  let name = "";
  for (let n = index + 1; n > 0; ) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - rest) / 26);
  }
  return name;
};

function sheetXml(columns: Column[], rows: Cell[][]): string {
  const lastRow = rows.length + 1;
  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
    .join("");

  const cell = (value: Cell, ref: string) =>
    typeof value === "number"
      ? `<c r="${ref}"><v>${value}</v></c>`
      : `<c r="${ref}" t="str"><v>${escapeXml(value)}</v></c>`;

  const header = `<row r="1">${columns
    .map((c, i) => cell(c.header, `${columnName(i)}1`))
    .join("")}</row>`;

  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 2}">${row
          .map((value, i) => cell(value, `${columnName(i)}${r + 2}`))
          .join("")}</row>`,
    )
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${columnName(columns.length - 1)}${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${header}${body}</sheetData></worksheet>`
  );
}

/** ZIP에 들어가는 CRC-32. 표를 한 번 만들어 두고 쓴다. */
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = -1;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * 압축된 ZIP을 만든다.
 *
 * xlsx는 그냥 ZIP이다. 날짜는 고정값으로 넣는다 — 같은 내용이면 같은 바이트가
 * 나오는 편이 낫다. 엑셀은 이 값을 보지 않는다.
 */
function zip(entries: Array<{ name: string; data: string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.data, "utf8");
    const deflated = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 풀려면 필요한 버전
    local.writeUInt16LE(0x0800, 6); // 이름이 UTF-8이다
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + deflated.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuffer, end]);
}

/** 시트 한 장짜리 xlsx를 만든다. */
export function buildXlsx(sheetName: string, columns: Column[], rows: Cell[][]): Buffer {
  return zip([
    {
      name: "[Content_Types].xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    // 서식은 하나도 안 쓰지만 styles.xml 자체는 넣는다. 없어도 규격에는 맞지만
    // 이걸 없는 셈 치지 않고 참조하는 읽기 구현이 있다.
    {
      name: "xl/styles.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="1"><font><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `<dxfs count="0"/><tableStyles count="0"/></styleSheet>`,
    },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(columns, rows) },
  ]);
}

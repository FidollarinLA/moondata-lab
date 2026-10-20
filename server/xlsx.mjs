import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { crc32 } from 'node:zlib';
import { AppError } from './core.mjs';

function u16(buf, i) { return buf[i] | (buf[i + 1] << 8); }
function u32(buf, i) { return (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24)) >>> 0; }

/** Minimal ZIP reader for Office Open XML packages (store + deflate). */
export function unzip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const files = new Map();
  let i = 0;
  while (i + 30 <= buf.length && u32(buf, i) === 0x04034b50) {
    const method = u16(buf, i + 8);
    const compSize = u32(buf, i + 18);
    const uncompSize = u32(buf, i + 22);
    const nameLen = u16(buf, i + 26);
    const extraLen = u16(buf, i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const start = i + 30 + nameLen + extraLen;
    const compressed = buf.subarray(start, start + compSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new AppError(`不支持的 ZIP 压缩方式（${method}）`);
    if (uncompSize && data.length !== uncompSize) throw new AppError('XLSX 压缩内容长度不一致');
    files.set(name, data);
    i = start + compSize;
  }
  if (!files.size) throw new AppError('不是有效的 XLSX / ZIP 文件');
  return files;
}

function xmlText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function decodeXmlEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  const strings = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const parts = [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => decodeXmlEntities(x[1]));
    strings.push(parts.join(''));
  }
  return strings;
}

function colRow(ref) {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}

function parseSheet(xml, shared) {
  const cells = new Map();
  let maxRow = -1, maxCol = -1;
  const re = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1] || m[3] || '';
    const body = m[2] || '';
    const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
    const pos = ref ? colRow(ref) : null;
    if (!pos) continue;
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
    let value = '';
    if (type === 'inlineStr') {
      const t = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(body);
      value = t ? decodeXmlEntities(t[1]) : '';
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'b') value = v === '1' ? 'true' : 'false';
      else if (type === 'str') value = decodeXmlEntities(v);
      else value = v;
    }
    cells.set(`${pos.row},${pos.col}`, value);
    maxRow = Math.max(maxRow, pos.row);
    maxCol = Math.max(maxCol, pos.col);
  }
  if (maxRow < 0 || maxCol < 0) throw new AppError('工作表为空');
  const rows = [];
  for (let r = 0; r <= maxRow; r++) {
    const row = [];
    for (let c = 0; c <= maxCol; c++) row.push(cells.get(`${r},${c}`) ?? '');
    rows.push(row);
  }
  return rows;
}

function firstSheetPath(files) {
  const workbook = files.get('xl/workbook.xml')?.toString('utf8');
  if (!workbook) throw new AppError('XLSX 缺少 workbook.xml');
  const sheet = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?>/.exec(workbook)
    || /<sheet\b[^>]*\br:id="([^"]+)"[^>]*\bname="([^"]+)"[^>]*\/?>/.exec(workbook);
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const rid = sheet ? (sheet[2].startsWith('rId') ? sheet[2] : sheet[1]) : 'rId1';
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
    || new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1]
    || 'worksheets/sheet1.xml';
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  if (!files.has(path)) throw new AppError('无法定位第一个工作表；多表簿仅导入第一个表');
  return { path, name: sheet ? (sheet[1].startsWith('rId') ? sheet[2] : sheet[1]) : 'Sheet1' };
}

/** Parse a simple flat XLSX workbook; only the first worksheet is used. */
export function parseXlsx(buffer) {
  if (!buffer || buffer.byteLength < 4) throw new AppError('XLSX 文件为空');
  if (buffer.byteLength > 10 * 1024 * 1024) throw new AppError('单份数据最大 10 MiB');
  const files = unzip(buffer);
  const shared = files.has('xl/sharedStrings.xml') ? parseSharedStrings(files.get('xl/sharedStrings.xml').toString('utf8')) : [];
  const { path, name } = firstSheetPath(files);
  const grid = parseSheet(files.get(path).toString('utf8'), shared);
  if (grid.length < 2) throw new AppError('工作表需要表头和至少一行数据');
  const headers = grid[0].map(h => String(h).trim());
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new AppError('表头不能为空或重复');
  if (headers.length > 128) throw new AppError('字段不能超过 128 个');
  const rows = grid.slice(1).filter(row => row.some(cell => String(cell).trim() !== ''));
  if (!rows.length || rows.length > 100000) throw new AppError('需要 1–100000 行数据');
  return { sheetName: name, headers, rows: rows.map(row => headers.map((_, i) => {
    const v = row[i] ?? '';
    return v === '' || v == null ? null : String(v);
  })) };
}

/** Build a minimal XLSX for tests (first sheet only, shared strings + numbers). */
export function buildXlsx(headers, rows) {
  const shared = [];
  const share = value => {
    const s = String(value);
    let i = shared.indexOf(s);
    if (i < 0) { i = shared.length; shared.push(s); }
    return i;
  };
  const cellRef = (r, c) => {
    let n = c + 1, name = '';
    while (n > 0) { const rem = (n - 1) % 26; name = String.fromCharCode(65 + rem) + name; n = Math.floor((n - 1) / 26); }
    return `${name}${r + 1}`;
  };
  const all = [headers, ...rows];
  let sheetBody = '';
  for (let r = 0; r < all.length; r++) {
    let cells = '';
    for (let c = 0; c < headers.length; c++) {
      const raw = all[r][c];
      if (raw === null || raw === undefined || raw === '') continue;
      const ref = cellRef(r, c);
      if (typeof raw === 'number' && Number.isFinite(raw)) cells += `<c r="${ref}"><v>${raw}</v></c>`;
      else cells += `<c r="${ref}" t="s"><v>${share(raw)}</v></c>`;
    }
    sheetBody += `<row r="${r + 1}">${cells}</row>`;
  }
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map(s => `<si><t>${xmlText(s)}</t></si>`).join('')}</sst>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetBody}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  return zipStore({
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': rootRels,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': rels,
    'xl/worksheets/sheet1.xml': sheet,
    'xl/sharedStrings.xml': sst,
  });
}

function zipStore(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, 'utf8');
    const compressed = deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    parts.push(local, compressed);
    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);
    central.push(cen);
    offset += local.length + compressed.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

/* 엑셀(.xlsx) 첫 번째 시트를 표(줄 × 칸 글자)로 읽기 — 외부 라이브러리 없이 브라우저의 압축 풀기 기능을 씀
   파일은 이 브라우저 안에서만 읽고 어디에도 올리지 않습니다. */
(function () {
  const td = new TextDecoder();
  async function inflate(bytes) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
    return new Uint8Array(await out.arrayBuffer());
  }
  // zip 목차(central directory)를 읽어 이름 → 내용 꺼내기 함수를 돌려줌
  function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let end = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('엑셀(.xlsx) 파일이 아니에요.');
    const files = {};
    let p = dv.getUint32(end + 16, true);
    for (let k = dv.getUint16(end + 10, true); k > 0 && dv.getUint32(p, true) === 0x02014b50; k--) {
      const nlen = dv.getUint16(p + 28, true);
      files[td.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nlen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    }
    return async (name) => {
      const f = files[name];
      if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const data = u8.subarray(start, start + f.size);
      return td.decode(f.method === 8 ? await inflate(data) : data);
    };
  }
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const texts = (el) => [...el.getElementsByTagName('t')].map((t) => t.textContent).join('');
  const colOf = (ref) => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

  async function read(buf) {
    const get = unzip(buf);
    const shared = [];
    const ss = await get('xl/sharedStrings.xml');
    if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push(texts(si));
    // 통합 문서에서 맨 앞 시트 찾기
    let path = 'xl/worksheets/sheet1.xml';
    const wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const first = xml(wb).getElementsByTagName('sheet')[0];
      const rid = first && first.getAttribute('r:id');
      const rel = rid && [...xml(rels).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
      if (rel) { const t = rel.getAttribute('Target'); path = t.startsWith('/') ? t.slice(1) : 'xl/' + t; }
    }
    const sh = await get(path);
    if (!sh) throw new Error('엑셀에서 시트를 찾지 못했어요.');
    const rows = [];
    for (const r of xml(sh).getElementsByTagName('row')) {
      const row = [];
      for (const c of r.getElementsByTagName('c')) {
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
        const val = t === 's' ? shared[Number(v && v.textContent)] : t === 'inlineStr' ? texts(c) : v ? v.textContent : '';
        const ref = c.getAttribute('r');
        row[ref ? colOf(ref) : row.length] = val == null ? '' : String(val);
      }
      rows.push(Array.from(row, (x) => (x == null ? '' : x)));
    }
    return rows;
  }
  window.XlsxLite = { read };
})();

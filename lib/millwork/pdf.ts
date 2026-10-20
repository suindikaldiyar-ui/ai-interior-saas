/**
 * PDF ИЗ СТРАНИЦ-КАРТИНОК (CUT-01) — без библиотек.
 *
 * Каждая страница — JPEG той же разметки, что на экране (`cuttingPdfPages`),
 * на весь лист A4. Своего шрифта PDF не встраивает: текст уже в картинке,
 * а кириллица в стандартных шрифтах PDF не живёт. Тащить в бандл библиотеку
 * с шрифтом ради одной кнопки незачем — структура PDF-1.4 с картинками
 * укладывается в сотню строк и проверяется числами (xref, число страниц).
 */

export type PdfPage = { jpeg: Uint8Array; widthPx: number; heightPx: number };

/** Строка в байты один к одному: структура PDF — ASCII. */
function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0x7e) throw new Error(`В структуре PDF символ вне ASCII: ${JSON.stringify(text[i])}`);
    out[i] = code;
  }
  return out;
}

/** Строка PDF в UTF-16BE с меткой порядка байт: название документа по-русски. */
function utf16Hex(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i += 1) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

/**
 * Документ PDF: страницы A4 альбомом (842 × 595 pt), картинка на всю страницу.
 * `date` — «ГГГГ-ММ-ДД»: дата документа приходит снаружи, а не берётся из
 * часов, — одинаковый вход даёт одинаковые байты.
 */
export function pdfFromJpegPages(pages: PdfPage[], meta: { title: string; date: string }): Uint8Array {
  if (pages.length === 0) throw new Error('PDF без страниц не собирается.');
  const W = 842;
  const H = 595;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const text = (value: string) => push(ascii(value));

  /* Заголовок и строка с байтами выше 127: просмотрщики узнают по ней двоичный файл. */
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const open = (num: number) => {
    offsets[num] = length;
    text(`${num} 0 obj\n`);
  };
  const close = () => text('\nendobj\n');

  const pageNum = (i: number) => 4 + i * 3;
  const contentNum = (i: number) => 5 + i * 3;
  const imageNum = (i: number) => 6 + i * 3;
  const total = 4 + pages.length * 3;

  open(1);
  text('<< /Type /Catalog /Pages 2 0 R >>');
  close();
  open(2);
  text(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageNum(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  close();
  open(3);
  const stamp = meta.date.replace(/[^0-9]/g, '').slice(0, 8);
  text(`<< /Title ${utf16Hex(meta.title)} /Producer (ALDIK Studio) /CreationDate (D:${stamp || '00000000'}) >>`);
  close();

  pages.forEach((page, i) => {
    if (!(page.widthPx > 0 && page.heightPx > 0) || page.jpeg.length < 4 || page.jpeg[0] !== 0xff || page.jpeg[1] !== 0xd8) {
      throw new Error(`Страница ${i + 1}: не JPEG или нулевой размер — PDF не собирается.`);
    }
    open(pageNum(i));
    text(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${imageNum(i)} 0 R >> >> /Contents ${contentNum(i)} 0 R >>`,
    );
    close();
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    open(contentNum(i));
    text(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    close();
    open(imageNum(i));
    text(
      `<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    );
    push(page.jpeg);
    text('\nendstream');
    close();
  });

  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let num = 1; num < total; num += 1) table += `${String(offsets[num]).padStart(10, '0')} 00000 n \n`;
  text(table);
  text(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * РАЗБОР СОБРАННОГО PDF — для приёмки: число страниц, картинки и что
 * таблица xref указывает ровно на начала объектов. Проверка, которая
 * не нашла ни одной страницы, — падение, а не «0 из 0».
 */
export function pdfStructure(bytes: Uint8Array): { ok: boolean; pages: number; images: number; problems: string[] } {
  const problems: string[] = [];
  let latin = '';
  for (let i = 0; i < bytes.length; i += 1) latin += String.fromCharCode(bytes[i]);
  if (!latin.startsWith('%PDF-1.4')) problems.push('нет заголовка %PDF-1.4');
  if (!latin.trimEnd().endsWith('%%EOF')) problems.push('нет %%EOF в конце');
  const start = /startxref\n(\d+)\n%%EOF\s*$/.exec(latin);
  if (!start) problems.push('нет startxref');
  const pages = (latin.match(/\/Type \/Page /g) ?? []).length;
  const images = (latin.match(/\/Filter \/DCTDecode/g) ?? []).length;
  const count = /\/Count (\d+)/.exec(latin);
  if (!count || Number(count[1]) !== pages) problems.push(`в /Count ${count?.[1] ?? 'нет'} при ${pages} страницах`);
  if (start) {
    const at = Number(start[1]);
    const table = latin.slice(at);
    const head = /^xref\n0 (\d+)\n/.exec(table);
    if (!head) problems.push('startxref не указывает на таблицу xref');
    else {
      const total = Number(head[1]);
      const rows = table.split('\n').slice(2, 2 + total);
      rows.forEach((row, num) => {
        if (num === 0) return;
        const offset = Number(row.slice(0, 10));
        if (!latin.startsWith(`${num} 0 obj`, offset)) problems.push(`xref: объект ${num} не на ${offset}`);
      });
    }
  }
  if (pages === 0) problems.push('страниц 0');
  return { ok: problems.length === 0, pages, images, problems };
}

import type { Panel } from '@/types/millwork';

/**
 * ВЫГРУЗКА ДЛЯ РАСКРОЯ.
 *
 * Программы раскроя, которыми пользуются мебельные компании, ждут `;`
 * в разделителе и кириллицу в windows-1251. UTF-8 они читают как «ÐÐ¾Ð»ÐºÐ°»,
 * поэтому кодировка переключается, а не выбирается за пользователя: часть
 * компаний работает в современных программах и ждёт UTF-8.
 */

export type CsvEncoding = 'windows-1251' | 'utf-8';

export const CSV_HEADER = [
  /*
   * Номер детали идёт ПЕРВОЙ колонкой: по нему деталь на распиловочном
   * столе сверяют с чертежом. Подпись «Дверца» в ряду встречается
   * несколько раз, номер — ни разу.
   */
  'Номер',
  'Наименование',
  'Материал',
  'Длина',
  'Ширина',
  'Количество',
  'КромкаД1',
  'КромкаД2',
  'КромкаШ1',
  'КромкаШ2',
  'Текстура',
] as const;

const GRAIN_LABEL: Record<Panel['grain'], string> = {
  along: 'вдоль',
  across: 'поперёк',
  none: 'без текстуры',
};

/** Кромка по торцам: две длинные и две короткие, каждая либо есть, либо нет. */
function edgeCells(panel: Panel): [string, string, string, string] {
  const mark = (n: number, index: number) => (index < n ? panel.edgeType : '');
  return [
    mark(panel.edges.long, 0),
    mark(panel.edges.long, 1),
    mark(panel.edges.short, 0),
    mark(panel.edges.short, 1),
  ];
}

/** Точка с запятой внутри значения сломала бы колонки. */
function cell(value: string | number): string {
  const text = String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function panelsToCsv(panels: Panel[]): string {
  const rows = panels.map((panel) => {
    const [d1, d2, s1, s2] = edgeCells(panel);
    return [
      panel.number,
      `${panel.moduleLabel} · ${panel.name}`,
      panel.material,
      panel.lengthMm,
      panel.widthMm,
      panel.qty,
      d1,
      d2,
      s1,
      s2,
      GRAIN_LABEL[panel.grain],
    ]
      .map(cell)
      .join(';');
  });

  // CRLF: так файл открывают Excel и программы раскроя на Windows.
  return [CSV_HEADER.join(';'), ...rows].join('\r\n') + '\r\n';
}

/*
 * windows-1251 однобайтовая: латиница совпадает с ASCII, кириллица идёт
 * сплошным блоком от 0xC0. Пишем таблицу руками — тащить в браузерный бандл
 * библиотеку перекодировки ради одного алфавита незачем.
 */
const CP1251_SPECIALS: Record<string, number> = {
  'Ё': 0xa8, // Ё
  'ё': 0xb8, // ё
  '«': 0xab, // «
  '»': 0xbb, // »
  '—': 0x97, // —
  '–': 0x96, // –
  '…': 0x85, // …
  '·': 0xb7, // ·
  ' ': 0xa0,
  '№': 0xb9, // №
};

export function encodeCp1251(text: string): Uint8Array {
  const out = new Uint8Array(text.length);

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    if (code < 0x80) {
      out[i] = code;
      continue;
    }

    const special = CP1251_SPECIALS[text[i]];
    if (special !== undefined) {
      out[i] = special;
      continue;
    }

    // А…я идут подряд: 0x410…0x44F → 0xC0…0xFF.
    if (code >= 0x410 && code <= 0x44f) {
      out[i] = code - 0x410 + 0xc0;
      continue;
    }

    // Чего в кодировке нет — вопросительный знак: молча терять символ хуже.
    out[i] = 0x3f;
  }

  return out;
}

/** Готовый файл: байты и MIME под выбранную кодировку. */
export function panelsCsvFile(
  panels: Panel[],
  encoding: CsvEncoding = 'windows-1251',
): { bytes: Uint8Array; type: string } {
  const text = panelsToCsv(panels);

  if (encoding === 'utf-8') {
    // BOM: без него Excel открывает UTF-8 как ANSI.
    const body = new TextEncoder().encode(text);
    const bytes = new Uint8Array(body.length + 3);
    bytes.set([0xef, 0xbb, 0xbf], 0);
    bytes.set(body, 3);
    return { bytes, type: 'text/csv;charset=utf-8' };
  }

  return { bytes: encodeCp1251(text), type: 'text/csv;charset=windows-1251' };
}

/** Имя файла: адрес объекта плюс дата, чтобы не терялось в загрузках. */
export function panelsFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'детализировка';
  const date = new Date().toISOString().slice(0, 10);
  return `${safe} — детализировка ${date}.csv`;
}

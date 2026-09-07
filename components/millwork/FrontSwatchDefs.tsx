import { shade, swatchKey, type FrontSwatch } from '@/lib/millwork/frontSwatch';

/**
 * РИСУНКИ ОБРАЗЦОВ ДЛЯ SVG.
 *
 * Один `<pattern>` на МАТЕРИАЛ, а не на модуль: ряд из тринадцати модулей
 * одного цвета — это один рисунок и одна заливка. Ключ считает
 * `swatchKey`, он же связывает схему с карточками в панели: разъехаться
 * им нельзя, иначе клиент выберет по карточке одно, а на схеме увидит
 * другое.
 *
 * Всё рисуется ЧИСЛАМИ: волокно шпона — линии, крошка ЛДСП — точки, блик
 * глянца — градиент. Никаких файлов в репозитории: фотография чужого
 * поставщика показывала бы клиенту плиту, которой компания не продаёт.
 * Настоящий образец приходит из каталога организации и подставляется
 * картинкой поверх (`imageUrl`).
 */

export function swatchId(swatch: FrontSwatch): string {
  return `sw-${swatchKey(swatch)}`;
}

function Pattern({ swatch }: { swatch: FrontSwatch }) {
  const id = swatchId(swatch);
  const ink = shade(swatch.color, swatch.color === '#33383D' ? 0.22 : -0.16);
  const light = shade(swatch.color, 0.34);

  /*
   * Настоящий образец компании кроется поверх процедурного: если файл не
   * загрузится, под ним остаётся рисунок, а не дыра.
   */
  if (swatch.imageUrl) {
    return (
      <pattern id={id} patternUnits="objectBoundingBox" width={1} height={1}>
        <rect width="100%" height="100%" fill={swatch.color} />
        <image
          href={swatch.imageUrl}
          x={0}
          y={0}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid slice"
        />
      </pattern>
    );
  }

  if (swatch.pattern === 'grain') {
    // Волокно шпона: неровные продольные линии, а не полоска в линейку.
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={26} height={18}>
        <rect width={26} height={18} fill={swatch.color} />
        {[3, 7.5, 12, 15.5].map((y, i) => (
          <path
            key={y}
            d={`M0 ${y} C 6 ${y - 1.1}, 13 ${y + 1.2}, 26 ${y - 0.5}`}
            fill="none"
            stroke={ink}
            strokeWidth={i % 2 === 0 ? 0.7 : 0.4}
            opacity={0.5 * swatch.strength}
          />
        ))}
      </pattern>
    );
  }

  if (swatch.pattern === 'speck') {
    // Декор ЛДСП: мелкая крошка. Точки стоят вразнобой, иначе видна сетка.
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={12} height={12}>
        <rect width={12} height={12} fill={swatch.color} />
        {[
          [2, 3],
          [7, 1.5],
          [10, 6],
          [4.5, 8],
          [1, 10.5],
          [8.5, 10],
        ].map(([cx, cy]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={0.55}
            fill={ink}
            opacity={0.42 * swatch.strength}
          />
        ))}
      </pattern>
    );
  }

  if (swatch.pattern === 'sheen') {
    /*
     * Глянец: диагональный блик. Это то, по чему глянцевый фасад узнают
     * на фотографии, и единственный способ показать его на плоскости.
     */
    return (
      <>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={swatch.color} />
          <stop offset="38%" stopColor={light} stopOpacity={0.9} />
          <stop offset="52%" stopColor={swatch.color} />
          <stop offset="100%" stopColor={shade(swatch.color, -0.08)} />
        </linearGradient>
        <pattern id={id} patternUnits="objectBoundingBox" width={1} height={1}>
          <rect width="100%" height="100%" fill={`url(#${id}-g)`} />
        </pattern>
      </>
    );
  }

  if (swatch.pattern === 'flat') {
    // Плёнка: очень слабая продольная полоса, почти гладкая плита.
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={14} height={14}>
        <rect width={14} height={14} fill={swatch.color} />
        <line x1={0} y1={7} x2={14} y2={7} stroke={ink} strokeWidth={0.3} opacity={0.3} />
      </pattern>
    );
  }

  // Эмаль: ровная плита без рисунка. Её и узнают по отсутствию рисунка.
  return (
    <pattern id={id} patternUnits="objectBoundingBox" width={1} height={1}>
      <rect width="100%" height="100%" fill={swatch.color} />
    </pattern>
  );
}

/** Все рисунки, встречающиеся в ряду. Дубли схлопнуты по ключу. */
export default function FrontSwatchDefs({ swatches }: { swatches: FrontSwatch[] }) {
  const unique = new Map(swatches.map((swatch) => [swatchKey(swatch), swatch]));

  return (
    <defs>
      {Array.from(unique.values()).map((swatch) => (
        <Pattern key={swatchKey(swatch)} swatch={swatch} />
      ))}
    </defs>
  );
}

/**
 * BLUM CLIP top BLUMOTION 110° (71B3550, накладная, чашка на саморезы) И ПРЯМАЯ
 * ОТВЕТНАЯ ПЛАНКА С ЭКСЦЕНТРИКОМ 20/32 (175H3130, подъём 3) — ВИЗУАЛЬНАЯ
 * РЕКОНСТРУКЦИЯ ПО ЧЕРТЕЖАМ ПРОИЗВОДИТЕЛЯ, НЕ CAD BLUM.
 *
 * CAD Blum — через E-SERVICES по паролю клиента; в проекте его нет. Геометрия
 * для реестра 3D (`meta.twin`, статус VISUAL_RECONSTRUCTION, источник «по
 * чертежу») — по «Каталог и техническое руководство 2024-2025 ru.pdf»:
 *   петля — «Проектирование» pdf 81 / печ. 77 (SH 21,5; SL 66,5; FLB 57;
 *     FLH 3,2; PB 37,5; DT 35; BT min 13; TB 3–7; INSERTA 45 / 9,5);
 *   обозначения — легенда «Размеры петли», «Размеры чашки» pdf 724 / печ. 720
 *     (SH — высота плеча, SL — длина плеча, FLB — ширина фланца, FLH — высота
 *     фланца, PB — необходимое пространство);
 *   планка — pdf 154 / печ. 150 (длина 58,3; ширина 18,7; высота H 11,5 при
 *     подъёме 3; отверстия 20 / 32; саморез Ø 3,5, рекомендуемая длина 17).
 *
 * Два сорта чисел, и они не смешиваются:
 *   PRINTED — напечатано (выше);
 *   TRACE   — форма с чертежей и фото страницы заказа (pdf 80): сечение плеча,
 *     щёки и оси шарнира, демпфер BLUMOTION, ступень планки, головки саморезов,
 *     место саморезов чашки (на чертеже «крестики без размеров»). Это вид, а не
 *     производственный размер: присадка и смета этих чисел не читают — чашку и
 *     планку сверлят по паспорту позиции (`hingeCupPlace`, `plateHolesOf`).
 *
 * Оси модели (мм) — те же, что у петли сцены (`hingeParts`): начало — ось чашки
 * на тыльной плоскости фасада; +X — от петельной кромки фасада внутрь фасада
 * (к середине шкафа); +Y — вверх вдоль кромки; +Z — в фасад (к лицу); −Z — в
 * корпус. Внутренняя плоскость боковины — по таблице наложения той же страницы:
 * FA = TB + 11 − MD при оси чашки на TB + DT/2 от кромки, то есть боковина на
 * DT/2 − 11 + MD от оси чашки при любом TB (`sideInnerXMm`): на ней стоит
 * планка, от неё — высота плеча SH. Левая петля; правая — отражением по X.
 *
 * Шарнир — четырёхзвенник `CLIP_TOP_110_OVERLAY` (`hingeLinkage`): оси плеча
 * (A0, B0) — на носу плеча, оси чашки (A1, B1) — в чашке; звенья рисует сцена
 * на каждом шаге хода, в файле их нет.
 */

/** Напечатано в каталоге — с местом. */
export const CT_PRINTED = {
  /** DT — диаметр отверстия под чашку (pdf 81). */
  cupDiameterMm: 35,
  /** BT — глубина сверления, напечатана как min 13 (pdf 81). */
  cupDepthMm: 13,
  /** FLB — ширина фланца чашки, вдоль кромки фасада (pdf 81, легенда pdf 724). */
  flangeWidthMm: 57,
  /** FLH — высота фланца над тыльной плоскостью фасада, на саморезы (INSERTA — 6,4) (pdf 81). */
  flangeHeightMm: 3.2,
  /** PB — необходимое пространство поперёк кромки, на саморезы (INSERTA — 43) (pdf 81). */
  flangeSpaceMm: 37.5,
  /** TB — от кромки фасада до края отверстия чашки (pdf 81). */
  tbMm: [3, 7] as const,
  /** SH — высота плеча над внутренней плоскостью боковины, накладная, прямое плечо (pdf 81). */
  armHeightMm: 21.5,
  /** SL — длина плеча от тыльной плоскости фасада, накладная (pdf 81). */
  armLengthMm: 66.5,
  /** INSERTA того же фланца: дюбели Ø 8 через 45, на 9,5 от оси чашки поперёк кромки (pdf 81). */
  insertaSpacingMm: 45,
  insertaOffsetMm: 9.5,
  /** Таблица «Расстояние от чашки TB», накладная: FA = TB + 11 при подъёме планки 0 (pdf 81; на чертеже — размер 11). */
  overlayOverTbMm: 11,
} as const;

/** Прямая ответная планка с эксцентриком 20/32, подъём 3 (175H3130), pdf 154 / печ. 150. */
export const PLATE_PRINTED = {
  lengthMm: 58.3,
  widthMm: 18.7,
  /** H — высота над боковиной при подъёме 3. */
  heightMm: 11.5,
  /** H той же планки с подъёмом 0 (175H3100) — при нём напечатаны SH и SL петли. */
  heightLift0Mm: 8.5,
  liftMm: 3,
  /** Отверстия под саморезы: 20 от передней кромки боковины, 32 между ними. */
  holeFromEdgeMm: 20,
  holeSpacingMm: 32,
  screwDiameterMm: 3.5,
  screwLengthMm: 17,
} as const;

/** Снято с чертежей и фото страницы заказа — форма, а не производственный размер. */
export const CT_TRACE = {
  /** TB, на котором стоит модель (середина 3–7, та же, что у петли сцены по умолчанию). */
  tbMm: 4,
  /** Край фланца со стороны кромки фасада (+X — внутрь фасада): обод вокруг чашки Ø35, 2,5 мм, по чертежу «Размеры чашки». */
  flangeEdgeXMm: -20,
  /** Отверстие фланца над чашкой: обод чашки 1 мм. */
  cupInnerDiameterMm: 33,
  /** Скругление торцов фланца. */
  flangeRadiusMm: 6,
  /** Саморезы чашки — по месту дюбелей INSERTA того же фланца (у версии на саморезы не образмерено). */
  cupScrewHeadDiameterMm: 7.5,
  cupScrewHeadHeightMm: 1.6,
  /** Оси шарнира (на концах звеньев), Ø, и щёки, между которыми ходят звенья: от оси петли по Y и толщина. */
  pinDiameterMm: 3,
  cheekInnerYMm: 3.1,
  cheekMm: 1.2,
  /** Проушина щеки вокруг оси, радиус. */
  eyeRadiusMm: 3,
  /** Плечо — штампованный швеллер, открытый к боковине: стенка и ширина вдоль Y. */
  armWallMm: 1.2,
  armWidthMm: 16,
  /** Где плечо сходит с планки к корпусу шарнира. */
  armNoseZMm: -15,
  /** Демпфер BLUMOTION внутри плеча: Ø и участок по длине. */
  damperDiameterMm: 8,
  damperZMm: [-60, -26] as const,
  /** Планка: основание (толщина) и средняя ступень под плечо (длина по Z, ширина по Y). */
  plateBaseMm: 2.5,
  plateRidgeLengthMm: 22,
  plateRidgeWidthMm: 11,
  /** Головка самореза планки и эксцентрик (Ø, высота). */
  plateScrewHeadDiameterMm: 7,
  plateScrewHeadHeightMm: 2,
  eccentricDiameterMm: 7,
} as const;

export type Outline = [number, number][];

/**
 * Внутренняя плоскость боковины в осях модели (X): кромка фасада — на TB + DT/2
 * от оси чашки, наложение FA = TB + 11 − MD (таблица pdf 81) — боковина на
 * DT/2 − 11 + MD от оси чашки, от TB не зависит. MD — подъём планки 175H3130 (3).
 */
export function sideInnerXMm(liftMm: number = PLATE_PRINTED.liftMm): number {
  return -(CT_PRINTED.cupDiameterMm / 2 - CT_PRINTED.overlayOverTbMm + liftMm);
}

/** Центр планки по глубине (Z): середина между отверстиями 20 и 52 от передней кромки. */
export function plateCenterZMm(): number {
  return -(PLATE_PRINTED.holeFromEdgeMm + PLATE_PRINTED.holeSpacingMm / 2);
}

/** Отверстия планки по Z (от передней кромки боковины — тыльной плоскости накладного фасада). */
export function plateHoleZMm(): [number, number] {
  return [-PLATE_PRINTED.holeFromEdgeMm, -(PLATE_PRINTED.holeFromEdgeMm + PLATE_PRINTED.holeSpacingMm)];
}

/**
 * КОНТУР ФЛАНЦА в плоскости тыла фасада (X поперёк кромки, Y вдоль): FLB 57 вдоль
 * кромки, PB 37,5 поперёк — напечатано; от какого края отложено PB — снято с
 * чертежа (край со стороны кромки на `flangeEdgeXMm`). Против часовой.
 */
export function flangeOutline(): Outline {
  const x0 = CT_TRACE.flangeEdgeXMm;
  const x1 = x0 + CT_PRINTED.flangeSpaceMm;
  const h = CT_PRINTED.flangeWidthMm / 2;
  const r = CT_TRACE.flangeRadiusMm;
  const arc = (cx: number, cy: number, from: number, to: number): Outline =>
    Array.from({ length: 7 }, (_, i) => {
      const a = from + ((to - from) * i) / 6;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
    });
  return [
    ...arc(x1 - r, -h + r, -Math.PI / 2, 0),
    ...arc(x1 - r, h - r, 0, Math.PI / 2),
    ...arc(x0 + r, h - r, Math.PI / 2, Math.PI),
    ...arc(x0 + r, -h + r, Math.PI, (3 * Math.PI) / 2),
  ];
}

/** Саморезы чашки (X, Y): по месту дюбелей INSERTA того же фланца — 45 вдоль кромки, 9,5 поперёк. */
export function cupScrewPointsMm(): [number, number][] {
  const y = CT_PRINTED.insertaSpacingMm / 2;
  return [
    [CT_PRINTED.insertaOffsetMm, -y],
    [CT_PRINTED.insertaOffsetMm, y],
  ];
}

/** Низ и верх плеча над боковиной (X): низ на планке, верх — SH, поднятый на подъём планки. */
export function armSpanXMm(): { bottom: number; top: number } {
  const side = sideInnerXMm();
  const bottom = side + PLATE_PRINTED.heightMm;
  return { bottom, top: bottom + (CT_PRINTED.armHeightMm - PLATE_PRINTED.heightLift0Mm) };
}

/** Площадь со знаком (против часовой — плюс): приёмке — контур не вывернут. */
export function signedArea(points: Outline): number {
  let s = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** Подпись модели в реестре — что напечатано, что снято. */
export const CT_WORDS =
  'Визуальная реконструкция по чертежам Blum (каталог 2024-2025: петля — pdf 81 / печ. 77, обозначения — pdf 724 / печ. 720, планка — pdf 154 / печ. 150): напечатаны чашка Ø35 × min 13, фланец 57 × 37,5 × 3,2, высота и длина плеча 21,5 / 66,5 (при подъёме планки 0; у планки с подъёмом 3 плечо выше на 3), планка 58,3 × 18,7 × H 11,5, отверстия 20 / 32; сечение плеча, щёки и оси шарнира, демпфер, ступень планки и место саморезов чашки сняты с чертежа и фото — не производственные размеры; оси звеньев — четырёхзвенник, подобранный под напечатанные угол 110° и вхождение 12 мм; присадку модель не задаёт.';

/**
 * ТЕХНИКА ЭТАПА 4 ПО ИНСТРУКЦИИ — СВЧ, ХОЛОДИЛЬНИК, ПОСУДОМОЙКА, ВЫТЯЖКА.
 *
 * Тот же канал, что у варочной и духового шкафа (`cookingFindings`):
 *   blocking — инструкция нарушена или прибор физически не встаёт: цены нет,
 *              «Дальше» и выпуск заперты, запись идёт;
 *   release  — нарушения нет, но выпустить нечем: чего-то нет в документах
 *              или движок этого не строит — заперт только выпуск в цех.
 *
 * Каждое число в словах — из факта модели (`data/catalog/appliances.json`)
 * с документом и страницей (`ruleSource`), размеры мебели — те же функции,
 * что режут раскрой: ниши колонны (`columnNiches`), высота корпуса
 * (`moduleCarcassHeightMm`), фасады (`buildPanels`). Без модели прибор
 * типовой, и здесь о нём не говорится ничего.
 */
import { applianceModel, modelTitle, ruleSource, unitModel } from './appliances';
import type { CookingFinding } from './cookingStack';
import { columnNiches, moduleCarcassHeightMm, moduleDepthMm, singleNicheOf } from './fill';
import { buildPanels } from './panels';
import { apronMm, plinthMm, shopOf } from './shop';
import type { ProductionSettings } from '@/types/catalog';
import type { Module, Run } from '@/types/millwork';

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Детали фасада модуля из раскроя: высота и ширина каждой. */
function frontsOf(unit: Module, panels: ReturnType<typeof buildPanels>): { heightMm: number; widthMm: number }[] {
  return panels
    .filter((p) => p.moduleId === unit.id && /^Фасад/.test(p.name))
    .flatMap((p) => Array.from({ length: p.qty }, () => ({ heightMm: p.lengthMm, widthMm: p.widthMm })));
}

export function applianceModelFindings(run: Run, production: ProductionSettings = shopOf(run.production)): CookingFinding[] {
  const out: CookingFinding[] = [];
  const t = shopOf(production).carcassMm;
  const plinth = plinthMm(production);
  const modules = run.modules;
  /* Вытяжка живёт в верхнем ряду: её модуль ищется и там. */
  const all = [...run.modules, ...(run.upperSegments ?? []).flatMap((segment) => segment.modules)];
  let panels: ReturnType<typeof buildPanels> | null = null;
  const panelsNow = () => (panels ??= buildPanels({ run, production }));

  for (const unit of all) {
    const carcass = moduleCarcassHeightMm(unit, run);
    const label = `«${unit.label || 'модуль'}»`;

    /* ─── СВЧ в колонне или пенале ─── */
    const mw = unitModel(unit, 'microwave');
    if (mw?.microwave) {
      const niche = unit.column
        ? (columnNiches(unit, carcass, production).find((n) => n.appliance === 'microwave') ?? null)
        : unit.appliance === 'microwave'
          ? singleNicheOf(unit, carcass)
          : null;
      if (niche) {
        const clear = niche.toMm - niche.fromMm - t;
        const [lo, hi] = mw.microwave.column.nicheHeightMm;
        if (clear < lo || clear > hi) {
          out.push({
            moduleId: unit.id,
            level: 'blocking',
            words:
              `${label}: ${modelTitle(mw)} — просвет ниши между опорами ${clear} мм, а в колонне нужно ${lo}…${hi} мм ` +
              `(${ruleSource(mw, 'column')}) — ${clear > hi ? `лишние ${clear - hi}` : `не хватает ${lo - clear}`} мм; ` +
              `опоры стоят на отверстиях 32 при полке ${t} мм, и просвета ${lo}…${hi} на них не получить`,
          });
        }
        const bottom = plinth + niche.fromMm + t / 2;
        if (bottom < mw.microwave.installFromFloorMinMm) {
          out.push({
            moduleId: unit.id,
            level: 'blocking',
            words: `${label}: ${modelTitle(mw)} стоит на ${Math.round(bottom)} мм от пола, а ставить её нужно не ниже ${mw.microwave.installFromFloorMinMm} мм (${ruleSource(mw, 'general')})`,
          });
        }
        if (mw.microwave.noBackPanel) {
          out.push({
            moduleId: unit.id,
            level: 'release',
            words:
              `${label}: у шкафа под ${modelTitle(mw)} не должно быть задней стенки (${ruleSource(mw, 'general')}), а в раскрое задняя ` +
              'стенка идёт во всю высоту колонны — как цех режет её за прибором, не подтверждено',
          });
        }
      }
    }

    /* ─── Холодильник ─── */
    const fridgeModel = unitModel(unit, 'fridge');
    const fridge = fridgeModel?.fridge;
    if (fridgeModel && fridge && unit.appliance === 'fridge') {
      if (fridge.builtIn && fridge.niche) {
        const inner = carcass - 2 * t;
        const [lo, hi] = fridge.niche.heightMm;
        if (inner < lo || inner > hi) {
          out.push({
            moduleId: unit.id,
            level: 'blocking',
            words:
              `${label}: ниша ${modelTitle(fridgeModel)} между дном и крышей колонны ${inner} мм, а нужно ${lo}…${hi} мм ` +
              `(${ruleSource(fridgeModel, 'niche')}) — ${inner > hi ? `лишние ${inner - hi}` : `не хватает ${lo - inner}`} мм`,
          });
        }
        const depth = moduleDepthMm(unit, run.zone, production);
        if (depth < fridge.niche.depthMinMm) {
          out.push({
            moduleId: unit.id,
            level: 'blocking',
            words: `${label}: глубина колонны ${depth} мм, а нише ${modelTitle(fridgeModel)} нужно не меньше ${fridge.niche.depthMinMm} мм (${ruleSource(fridgeModel, 'depth')})`,
          });
        }
        if (fridge.ventilation) {
          out.push({
            moduleId: unit.id,
            level: 'release',
            words:
              `${label}: вентиляция ${modelTitle(fridgeModel)} — ${fridge.ventilation.inletCm2} см² на вход и ${fridge.ventilation.outletCm2} см² на выход ` +
              `(${fridge.ventilation.how}; ${ruleSource(fridgeModel, 'ventilation')}) — в цоколе и над прибором проёмы не заложены; ` +
              'размеры мебельных фасадов по двери прибора есть только на чертеже другой модели (KI86SAF30)',
          });
        }
      }
      if (!fridge.builtIn && fridge.cookerSideMinMm !== undefined) {
        /* Варочная вплотную к отдельностоящему: от края панели до боковины прибора. */
        for (const side of modules) {
          if (side.appliance !== 'hob') continue;
          const touching = side.offsetMm === unit.offsetMm + unit.widthMm || side.offsetMm + side.widthMm === unit.offsetMm;
          if (!touching) continue;
          const hob = unitModel(side, 'hob');
          if (!hob) {
            out.push({
              moduleId: unit.id,
              level: 'release',
              words:
                `${label}: варочная вплотную к ${modelTitle(fridgeModel)} — до плит нужно не меньше ${fridge.cookerSideMinMm} мм ` +
                `(${ruleSource(fridgeModel, 'cooker')}), а ширина типовой панели неизвестна: расстояние не проверено`,
            });
            continue;
          }
          const gap = (side.widthMm - hob.sizeMm.width) / 2;
          if (gap < fridge.cookerSideMinMm) {
            out.push({
              moduleId: unit.id,
              level: 'blocking',
              words:
                `${label}: от края ${modelTitle(hob)} до ${modelTitle(fridgeModel)} ${fmt(gap)} мм, а нужно не меньше ${fridge.cookerSideMinMm} мм ` +
                `(${ruleSource(fridgeModel, 'cooker')}) — разнесите варочную и холодильник`,
            });
          }
        }
      }
    }

    /* ─── Посудомойка ─── */
    const dwModel = unit.appliance === 'dishwasher45' || unit.appliance === 'dishwasher60' ? unitModel(unit, unit.appliance) : null;
    const dw = dwModel?.dishwasher;
    if (dwModel && dw) {
      const niche = plinth + carcass;
      const [lo, hi] = dw.nicheHeightMm;
      if (niche < lo || niche > hi) {
        out.push({
          moduleId: unit.id,
          level: 'blocking',
          words:
            `${label}: ниша ${modelTitle(dwModel)} от пола до столешницы ${niche} мм, а нужно ${lo}…${hi} мм ` +
            `(${ruleSource(dwModel, 'niche')}) — ${niche > hi ? `лишние ${niche - hi}` : `не хватает ${lo - niche}`} мм`,
        });
      }
      const [wLo, wHi] = dw.nicheWidthMm;
      if (unit.widthMm < wLo || unit.widthMm > wHi) {
        out.push({
          moduleId: unit.id,
          level: 'blocking',
          words: `${label}: ширина ниши ${unit.widthMm} мм, а ${modelTitle(dwModel)} нужно ${wLo}…${wHi} мм (${ruleSource(dwModel, 'niche')})`,
        });
      }
      const depth = moduleDepthMm(unit, run.zone, production);
      if (depth < dw.nicheDepthMinMm) {
        out.push({
          moduleId: unit.id,
          level: 'blocking',
          words: `${label}: глубина ряда ${depth} мм, а нише ${modelTitle(dwModel)} нужно не меньше ${dw.nicheDepthMinMm} мм (${ruleSource(dwModel, 'niche')})`,
        });
      }
      const fronts = frontsOf(unit, panelsNow());
      for (const front of fronts) {
        if (front.heightMm > dw.front.maxHeightMm) {
          out.push({
            moduleId: unit.id,
            level: 'blocking',
            words:
              `${label}: мебельный фасад ${front.heightMm} мм выше ${dw.front.maxHeightMm} мм, которые держит дверь ${modelTitle(dwModel)} ` +
              `(${ruleSource(dwModel, 'front')}) — лишние ${front.heightMm - dw.front.maxHeightMm} мм`,
          });
        }
      }
      const wide = fronts.find((front) => front.widthMm > dw.front.maxWidthMm);
      const [plLo, plHi] = dw.plinthMm;
      out.push({
        moduleId: unit.id,
        level: 'release',
        words:
          `${label}: фасад на двери ${modelTitle(dwModel)} — масса не рассчитана (плотности плиты в каталоге нет; дверь держит ` +
          `${fmt(dw.front.massKg[0])}…${fmt(dw.front.massKg[1])} кг, ${ruleSource(dwModel, 'front')})` +
          (wide ? `; фасад ${wide.widthMm} мм шире ${dw.front.maxWidthMm} мм шаблона рисунка 5 — подойдёт ли, в листе не сказано` : '') +
          (plinth < plLo || plinth > plHi
            ? `; цоколь ${plinth} мм вне ${plLo}…${plHi} мм — диапазон только на чертеже другой модели семейства`
            : ''),
      });
    }

    /* ─── Вытяжка ─── */
    const hoodModel = unitModel(unit, 'hood');
    const hood = hoodModel?.hood;
    if (hoodModel && hood) {
      const hobUnit = [...modules].find((m) => m.appliance === 'hob');
      const hob = hobUnit ? applianceModel(hobUnit.applianceModels?.hob) : null;
      /*
       * Низ вытяжки — ниже шкафа: общая высота 175 при коробе 135 в шкафу
       * (рис. A) — 40 мм прибора под дном навесного ряда.
       */
      const below = hood.totalHeightMm - hood.boxHeightMm;
      const above = apronMm(production) - below;
      const gas = hob?.type === 'gas';
      const need = gas ? hood.aboveGasMinMm : hood.aboveElectricMinMm;
      if (above < need) {
        out.push({
          moduleId: unit.id,
          level: 'blocking',
          words:
            `${label}: низ ${modelTitle(hoodModel)} в ${above} мм над столешницей (на ${below} мм ниже шкафа, ${ruleSource(hoodModel, 'size')}), ` +
            `а над ${gas ? 'газовой' : 'электрической'} панелью нужно не меньше ${need} мм (${ruleSource(hoodModel, 'height')}) — ` +
            `поднимите низ навесного ряда на ${need - above} мм`,
        });
      }
      if (!hob && above < hood.aboveGasMinMm) {
        out.push({
          moduleId: unit.id,
          level: 'release',
          words:
            `${label}: тип варочной моделью не выбран — над электрической ${modelTitle(hoodModel)} встаёт (${above} ≥ ${hood.aboveElectricMinMm} мм), ` +
            `над газовой нужно ${hood.aboveGasMinMm} мм (${ruleSource(hoodModel, 'height')})`,
        });
      }
      const inner = unit.widthMm - 2 * t;
      out.push({
        moduleId: unit.id,
        level: 'release',
        words:
          `${label}: ${modelTitle(hoodModel)} в инструкции по монтажу не названа (${ruleSource(hoodModel, 'notNamed')}) — посадка в шкаф ` +
          `не подтверждена: ширина установки ${hood.installWidthMm} мм при внутренней ширине шкафа ${inner} мм, короб ${hood.boxHeightMm} мм ` +
          `от промежуточной полки; ход экрана в документах нет`,
      });
    }
  }
  return out;
}

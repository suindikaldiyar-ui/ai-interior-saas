import type { BazisModel } from './bazisModel';

/**
 * СКРИПТ ИМПОРТА В БАЗИС-МЕБЕЛЬЩИК (слой 88) — РЕДАКТИРУЕМАЯ МОДЕЛЬ, А НЕ КАРТИНКА.
 *
 * Файлов .b3d мы не пишем: формат закрыт. Модель собирает сама программа, документированным скриптом:
 * панели — настоящими панелями БАЗИС со своим материалом, контуром, кромкой и выемками; сохраняет её человек
 * штатной командой «Файл → Сохранить». Вызовы — только из опубликованных примеров и описания
 * (BAZIS-Script_examples, Script.pdf, BazisSoft/Scripts); скрипт сам определяет поколение API:
 *
 *   современное  `objects3d.NewPanel`, `materialData.SetupActiveMaterial`, `panelOperations.AddButt`, `AddCut`
 *   прежнее      `AddPanel`, `MaterialName`, `AddButt`, `Contour.AddCircle`
 *
 * Отверстий напрямую в панель БАЗИС API не добавляет: отверстия программы — следствие установленной фурнитуры.
 * Поэтому отверстие на пласти приезжает круглой выемкой (современное API) или вырезом контура (сквозное), и это
 * сказано словами в отчёте; отверстие в торце не передаётся вовсе и названо. Настоящая присадка станка — файл
 * `drilling.csv` пакета. Импорт в настоящей программе НЕ проверялся: её на машине разработки нет. Приёмка гоняет
 * скрипт на строгом подобии опубликованного API — вызов, которого в документации нет, там падает.
 *
 * Текст — только ASCII: кодировку файла скрипта документация не называет, у примеров это windows-1251.
 */

export const BAZIS_SCRIPT_NAME = 'aldik-import-bazis.js';

/** Всё, что не ASCII, — `\uXXXX`: в строке JS это тот же символ при любой кодировке файла. */
export function asciiJs(text: string): string {
  return text.replace(/[^\x00-\x7f]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const RUNTIME = String.raw`
(function (MODEL) {
  var modern = typeof objects3d !== 'undefined' && objects3d && typeof objects3d.NewPanel === 'function';
  var legacy = !modern && typeof AddPanel === 'function';
  var lines = [];
  var built = 0, moved = 0, failed = 0, edges = 0, pockets = 0, cuts = 0, skippedEdge = 0, skippedBlind = 0;

  function say(text) { lines.push(text); if (typeof console !== 'undefined' && console.log) console.log(text); }
  function show(text) {
    if (modern && typeof UI !== 'undefined' && UI.dialogs && UI.dialogs.MessageBox) UI.dialogs.MessageBox(text);
    else if (typeof alert === 'function') alert(text);
  }
  function vector(v) { return modern ? geometry3d.VectorMake(v[0], v[1], v[2]) : NewVector(v[0], v[1], v[2]); }

  if (!modern && !legacy) {
    say('Этот скрипт запускают внутри БАЗИС-Мебельщик: нужных функций здесь нет.');
    show(lines.join('\r\n'));
    return;
  }

  var materials = {};
  MODEL.materials.forEach(function (m) { materials[m.key] = m; });

  /* Блоки: один на модуль. */
  var blocks = {};
  function blockOf(panel) {
    var key = panel.placed ? panel.moduleId : 'unplaced';
    if (!modern) return null;
    if (!blocks[key]) {
      var title = '';
      MODEL.modules.forEach(function (m) { if (m.id === key) title = m.title; });
      blocks[key] = objects3d.NewBlock(key === 'unplaced' ? 'Детали без места' : (title || key));
    }
    return blocks[key];
  }

  function outline(panel, L, W) {
    var c = panel.Contour;
    c.Clear();
    c.AddLine(0, 0, L, 0);
    c.AddLine(L, 0, L, W);
    c.AddLine(L, W, 0, W);
    c.AddLine(0, W, 0, 0);
  }

  function newPanel(p) {
    var m = materials[p.materialKey];
    var panel;
    if (modern) {
      materialData.SetupActiveMaterial(m.bazisName, m.thicknessMm, 0);
      panel = objects3d.NewPanel(p.lengthMm, p.widthMm, objects3d.PanelOrientation.front, blockOf(p));
    } else {
      panel = AddPanel(p.lengthMm, p.widthMm);
      panel.Thickness = p.thicknessMm;
      panel.MaterialName = m.bazisName;
    }
    panel.Name = p.number + '/' + p.piece + ' ' + p.name;
    outline(panel, p.lengthMm, p.widthMm);
    return panel;
  }

  function addEdges(panel, p) {
    p.edges.forEach(function (e) {
      if (modern) {
        materialData.SetupActiveButtMaterial(e.material, e.thicknessMm, 0, true, e.material, 0, true, 0);
        panelOperations.AddButt(panel, e.element);
      } else {
        panel.AddButt(e.material, e.element);
      }
      edges += 1;
    });
  }

  function addHoles(panel, p) {
    p.holes.forEach(function (h) {
      if (h.edge) {
        skippedEdge += 1;
        return;
      }
      if (h.through) {
        panel.Contour.AddCircle(h.xMm, h.yMm, h.diameterMm / 2);
        cuts += 1;
        return;
      }
      if (!modern) {
        skippedBlind += 1;
        return;
      }
      var fromPlus = (h.face === 'A') === p.faceAOnPlusZ;
      var name = (MODEL.holesMode === 'draft' ? 'ЧЕРНОВИК ' : '') + h.title;
      var pocket = panelOperations.AddCut(panel, panelOperations.cutType.extrusion, name, 'D' + h.diameterMm + ' x ' + h.depthMm);
      pocket.Contour.AddCircle(h.xMm, h.yMm, h.diameterMm / 2);
      pocket.Thickness = fromPlus ? -h.depthMm : h.depthMm;
      pockets += 1;
    });
  }

  function grain(panel, p) {
    if (typeof TextureOrientation === 'undefined' || p.grain === 'none') return;
    panel.TextureOrientation = p.grain === 'along' ? TextureOrientation.Horizontal : TextureOrientation.Vertical;
  }

  /* The local corner (0, 0, lowest Z) goes to p.origin; the panel keeps its own thickness direction. */
  function place(panel, p, index) {
    var target = p.placed ? p.origin : [0, -1000 - index * 60, 0];
    if (p.placed) panel.OrientGCS(vector(p.axisZ), vector(p.axisY));
    var low = panel.GabMin;
    var at = panel.ToGlobal(modern ? geometry3d.VectorMake(0, 0, low.z) : NewVector(0, 0, low.z));
    panel.TranslateGCS(vector([target[0] - at.x, target[1] - at.y, target[2] - at.z]));
  }

  function check(panel, p) {
    if (!p.placed) return;
    var a = panel.ToGlobal(panel.GabMin);
    var b = panel.ToGlobal(panel.GabMax);
    var pairs = [[a.x, b.x, 0], [a.y, b.y, 1], [a.z, b.z, 2]];
    for (var i = 0; i < 3; i += 1) {
      var lo = Math.min(pairs[i][0], pairs[i][1]);
      var hi = Math.max(pairs[i][0], pairs[i][1]);
      var k = pairs[i][2];
      if (Math.abs(lo - p.min[k]) > 0.6 || Math.abs(hi - p.max[k]) > 0.6) {
        moved += 1;
        say('Габарит не совпал: ' + p.number + '/' + p.piece + ' ' + p.name + ', ось ' + 'XYZ'.charAt(k) + ': ' + lo.toFixed(1) + '...' + hi.toFixed(1) + ' вместо ' + p.min[k] + '...' + p.max[k]);
        return;
      }
    }
  }

  say('ALDIK Studio: ' + MODEL.title + ' (' + MODEL.exportedAt + '), отпечаток ' + MODEL.fingerprint);
  say('API БАЗИС: ' + (modern ? 'современное' : 'прежнее') + '. Деталей в файле: ' + MODEL.panels.length);
  if (MODEL.holesMode === 'draft') say('ЧЕРНОВИК: присадка не подтверждена цехом и в производство не идёт.');
  if (MODEL.holesMode === 'none') say('Присадки в файле нет: ' + (MODEL.holesWhy.join(' ') || 'выпуск закрыт.'));

  MODEL.panels.forEach(function (p, index) {
    try {
      var panel = newPanel(p);
      addEdges(panel, p);
      addHoles(panel, p);
      grain(panel, p);
      panel.Build();
      place(panel, p, index);
      check(panel, p);
      built += 1;
      if (!p.placed) say('Без места (блок «Детали без места»): ' + p.number + '/' + p.piece + ' ' + p.name);
      if (p.shape) say('Форма: ' + p.number + '/' + p.piece + ' ' + p.name + ' — ' + p.shape);
    } catch (error) {
      failed += 1;
      say('НЕ СОБРАЛАСЬ: ' + p.number + '/' + p.piece + ' ' + p.name + ' — ' + error);
    }
  });

  if (modern && typeof historyOperations !== 'undefined') historyOperations.CommitCurrentChanges('ALDIK Studio: импорт модели');

  var notMapped = MODEL.materials.filter(function (m) { return !m.mapped; }).map(function (m) { return m.name; });
  say('Собрано панелей: ' + built + ' из ' + MODEL.panels.length + (failed ? ', не собралось: ' + failed : '') + (moved ? ', габарит не совпал: ' + moved : ''));
  say('Кромок: ' + edges + '. Выемок на пласти: ' + pockets + '. Сквозных вырезов контура: ' + cuts + '.');
  if (skippedEdge) say('Отверстий в торцах не передано: ' + skippedEdge + ' — они в файле drilling.csv.');
  if (skippedBlind) say('Глухих отверстий не передано: ' + skippedBlind + ' — у этой версии API выемок нет, они в файле drilling.csv.');
  if (notMapped.length) say('Материалы без сопоставления с базой цеха (приехали своим названием): ' + notMapped.join('; '));
  say('Сохраните модель: Файл - Сохранить как.');
  show(lines.slice(0, 40).join('\r\n'));
})
`;

/** Файл скрипта: данные объекта внутри, один файл — кладётся в папку Scripts и запускается из меню. */
export function bazisImportScript(model: BazisModel): string {
  const head = `// ALDIK Studio -> BAZIS. ${model.version}. Generated file, do not edit.\n// Run it inside BAZIS: Scripts menu. Check the result in BAZIS before production.\n`;
  return asciiJs(`${head}${RUNTIME.trim()}(${JSON.stringify(model)});\n`);
}

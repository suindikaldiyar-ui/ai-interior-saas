/**
 * Разбиение по зонам (floor / walls / upholstery) нужно не для красоты:
 * из него собирается BINDING TABLE в промпте, которая не даёт модели
 * перепутать пол со стеной.
 */
export type RenderStyle = {
  id: string;
  kk: string;
  ru: string;
  /** Короткое описание для карточки в интерфейсе. */
  summary: string;
  palette: string;
  materials: string;
  floor: string;
  walls: string;
  upholstery: string;
  textiles: string;
  light: string;
  decor: string;
  /**
   * Что этот стиль означает именно для КУХНИ: фасады, вытяжка, подсветка.
   * Без этой строки стиль описывает комнату вообще, а гарнитур в ней
   * получается «какой-нибудь».
   */
  kitchen?: string;
};

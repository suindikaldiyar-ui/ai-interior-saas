import sharp from 'sharp';

/**
 * Композитный референс для покрытий.
 *
 * Модели нельзя давать фотографию укладки: она копирует чужую комнату вместе
 * с её светом, мебелью и ракурсом. Нужен кроп самой текстуры без перспективы
 * плюс полоска усреднённого цвета — по ней модель уверенно берёт тон.
 */

const SIZE = 1024;
const STRIP_HEIGHT = 148;
const JPEG_QUALITY = 88;

export type CompositeResult = {
  buffer: Buffer;
  averageColor: string;
};

/** Средний цвет центральной области — края часто содержат виньетку и фон. */
async function averageColor(input: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data } = await sharp(input)
    .resize(32, 32, { fit: 'cover', position: 'centre' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return {
    r: Math.round(r / pixels),
    g: Math.round(g / pixels),
    b: Math.round(b / pixels),
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export async function buildComposite(input: Buffer): Promise<CompositeResult> {
  const avg = await averageColor(input);

  // Квадратный кроп по центру: перспектива и края укладки в референс не идут.
  const texture = await sharp(input)
    .resize(SIZE, SIZE - STRIP_HEIGHT, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const strip = await sharp({
    create: {
      width: SIZE,
      height: STRIP_HEIGHT,
      channels: 3,
      background: avg,
    },
  })
    .png()
    .toBuffer();

  const buffer = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: texture, top: 0, left: 0 },
      { input: strip, top: SIZE - STRIP_HEIGHT, left: 0 },
    ])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return { buffer, averageColor: toHex(avg) };
}

/** Бесшовный тайл для подстановки в 3D: квадрат без полоски цвета. */
export async function buildTexture(input: Buffer, size = 1024): Promise<Buffer> {
  return sharp(input)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 86 })
    .toBuffer();
}

/** Маленький образец для карточки в панели материалов. */
export async function buildSwatch(input: Buffer, size = 320): Promise<Buffer> {
  return sharp(input)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/** Фото товара для zone/object/opening — пропорции сохраняем. */
export async function buildPhoto(input: Buffer, max = 1280): Promise<Buffer> {
  return sharp(input)
    .resize(max, max, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
}

import sharp, { Sharp } from 'sharp';

const PADDING_RATIO = 0.18;

/**
 * Composites the logo, contained and padded, onto a solid square background.
 * Used for the Android launcher icon so OS icon-masking (circle, squircle, …)
 * never crops the logo itself.
 */
export async function renderFilledSquareIcon(
  source: Sharp,
  size: number,
  backgroundColor: string,
): Promise<Buffer> {
  const inner = Math.round(size * (1 - PADDING_RATIO * 2));
  const logoLayer = await source
    .clone()
    .resize(inner, inner, { fit: 'contain', background: backgroundColor })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: backgroundColor },
  })
    .composite([{ input: logoLayer, gravity: 'center' }])
    .png()
    .toBuffer();
}

/** Applies a circular mask to a square PNG buffer, for the round launcher icon. */
export async function toCircleMasked(square: Buffer, size: number): Promise<Buffer> {
  const circleMask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return sharp(square)
    .resize(size, size)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/**
 * White rounded card with the logo contained inside, matching the PWA splash
 * design language (logo on a soft card rather than directly on the background).
 */
export async function renderSplashCard(source: Sharp, size: number): Promise<Buffer> {
  const radius = Math.round(size * 0.22);
  const cardMask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  const inner = Math.round(size * 0.72);
  const logoLayer = await source
    .clone()
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();

  const card = await sharp(cardMask)
    .resize(size, size)
    .composite([{ input: logoLayer, gravity: 'center' }])
    .png()
    .toBuffer();

  return card;
}

export function loadLogo(buffer: Buffer): Sharp {
  return sharp(buffer, { failOn: 'none' }).ensureAlpha();
}

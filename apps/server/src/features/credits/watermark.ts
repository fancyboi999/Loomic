import sharp from "sharp";

/**
 * Apply a "Made with Loomic" watermark to an image buffer.
 *
 * Uses an SVG text overlay composited onto the image via sharp.
 * The watermark is positioned in the bottom-right corner with white text
 * at 40% opacity and a subtle drop shadow for readability.
 *
 * Font size scales proportionally to image width (~3%, clamped 12–48px).
 */
export async function applyWatermark(
  imageBuffer: Buffer,
  _mimeType: string,
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const width = metadata.width ?? 512;
  const height = metadata.height ?? 512;

  // Scale font size: ~3% of width, clamped between 12px and 48px
  const fontSize = Math.round(
    Math.min(48, Math.max(12, width * 0.03)),
  );
  const padding = Math.round(fontSize * 1.2);

  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.5)" />
    </filter>
  </defs>
  <text
    x="${width - padding}"
    y="${height - padding}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${fontSize}"
    fill="white"
    fill-opacity="0.4"
    text-anchor="end"
    filter="url(#shadow)"
  >Made with Loomic</text>
</svg>`,
  );

  return image
    .composite([{ input: svg, top: 0, left: 0 }])
    .toBuffer();
}

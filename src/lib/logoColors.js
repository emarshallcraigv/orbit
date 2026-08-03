/**
 * Suggest brand colors from a logo image (Branding, slice 3).
 *
 * IMPORTANT — this is a *starting guess*, not a correct answer. Extraction
 * quality varies a lot by logo: a flat two-color mark samples cleanly; a
 * photographic/gradient logo, one on a busy background, or a near-monochrome
 * mark gives weak or plain-wrong results. The UI always leaves the pickers
 * editable and says as much; this returns a suggestion or null, never a promise.
 *
 * suggestColorsFromPixels() is pure (no DOM) so the heuristic is unit-testable.
 * suggestColorsFromImageUrl() wraps it with a canvas sampler. We deliberately
 * DROP near-white, near-black, and low-saturation (gray) pixels before ranking,
 * since those are almost always background/outline, not brand color.
 */

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = ((b - r) / d + 2);
    else h = ((r - g) / d + 4);
    h /= 6;
  }
  return [h, s, l];
}

const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (r, g, b) => "#" + [r, g, b].map((x) => clampByte(x).toString(16).padStart(2, "0")).join("");

// data: RGBA Uint8ClampedArray (canvas getImageData). Returns { primary, accent }
// hex strings, or null when nothing usable was found (e.g. a pure black/white logo).
export function suggestColorsFromPixels(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;                    // skip mostly-transparent
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [, s, l] = rgbToHsl(r, g, b);
    if (l > 0.92 || l < 0.06 || s < 0.15) continue;     // drop near-white/black/gray
    const key = (r >> 4) + "-" + (g >> 4) + "-" + (b >> 4); // quantize to tame noise
    let e = buckets.get(key);
    if (!e) { e = { count: 0, r: 0, g: 0, b: 0 }; buckets.set(key, e); }
    e.count++; e.r += r; e.g += g; e.b += b;
  }
  if (buckets.size === 0) return null;

  const colors = [...buckets.values()].map((e) => {
    const r = e.r / e.count, g = e.g / e.count, b = e.b / e.count;
    const [, s] = rgbToHsl(r, g, b);
    return { count: e.count, r, g, b, s, lum: 0.299 * r + 0.587 * g + 0.114 * b };
  }).sort((a, b) => b.count - a.count);

  // Accent = the most saturated among the most common colors (the vivid brand
  // color, which isn't always the single most frequent pixel).
  const accent = colors.slice(0, 5).reduce((best, c) => (c.s > best.s ? c : best), colors[0]);
  // Primary = the darkest among the most common colors (headings/ink read dark);
  // if the logo has nothing dark, derive a dark shade of the accent instead.
  const darkest = colors.slice(0, 6).reduce((dk, c) => (c.lum < dk.lum ? c : dk), colors[0]);
  const primary = darkest.lum <= 90 ? darkest : { r: accent.r * 0.3, g: accent.g * 0.3, b: accent.b * 0.3 };

  return { primary: toHex(primary.r, primary.g, primary.b), accent: toHex(accent.r, accent.g, accent.b) };
}

// Load an image URL (use a same-origin object URL to avoid canvas tainting),
// downscale, and sample. Resolves to { primary, accent } or null; rejects if the
// image can't be loaded or the canvas can't be read.
export function suggestColorsFromImageUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        resolve(suggestColorsFromPixels(ctx.getImageData(0, 0, size, size).data));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Could not load the logo image."));
    img.src = url;
  });
}

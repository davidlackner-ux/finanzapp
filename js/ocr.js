// Receipt text recognition with Tesseract.js, loaded lazily on first use and run fully on the device.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let workerPromise = null;
let progressListener = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Texterkennung konnte nicht geladen werden (offline?)'));
    document.head.append(el);
  });
}

function getWorker() {
  workerPromise ??= (async () => {
    await loadScript(TESSERACT_URL);
    return window.Tesseract.createWorker('deu', 1, {
      logger: (m) => progressListener?.(m),
    });
  })().catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

/** Grayscale + contrast stretch helps Tesseract with thermal-paper receipts. */
async function preprocess(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * @param {Blob} blob receipt photo
 * @param {(progress: number, status: string) => void} [onProgress] progress 0..1
 * @returns {Promise<string>} recognized text
 */
export async function recognizeReceipt(blob, onProgress) {
  progressListener = (m) => {
    if (m.status === 'recognizing text') onProgress?.(0.3 + 0.7 * m.progress, 'Beleg wird gelesen');
    else onProgress?.(0.3 * (m.progress ?? 0), 'Texterkennung wird geladen');
  };
  onProgress?.(0, 'Texterkennung wird geladen');
  const worker = await getWorker();
  const input = await preprocess(blob).catch(() => blob);
  const { data } = await worker.recognize(input);
  return data.text;
}

/**
 * Fotos de máquina en onboarding: compresión local para localStorage (móvil).
 */

export const MAX_PHOTOS = 3;
const MAX_PHOTO_PX = 960;
const JPEG_QUALITY = 0.72;

export function compressImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, MAX_PHOTO_PX / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      try {
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Error al cargar la imagen'));
    img.src = dataUrl;
  });
}

const ACCEPTED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export interface ProcessedImageResult {
  dataUrl: string;
  fileName: string;
}

export function processUploadedImageFile(
  file: File,
  maxDimension = 1280
): Promise<ProcessedImageResult> {
  return new Promise((resolve, reject) => {
    if (
      !ACCEPTED_TYPES.has(file.type.toLowerCase()) &&
      !/\.(png|jpe?g|webp)$/i.test(file.name)
    ) {
      reject(
        new Error('Unsupported format. Please upload a PNG, JPG, or WebP image.')
      );
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      reject(new Error('Image exceeds 15 MB limit. Please choose a smaller file.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const rawDataUrl = reader.result as string;

      // Optimize large images gently via Canvas while keeping transparency
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        if (width <= maxDimension && height <= maxDimension && file.size <= 1.5 * 1024 * 1024) {
          resolve({ dataUrl: rawDataUrl, fileName: file.name });
          return;
        }

        const scale = Math.min(1, maxDimension / Math.max(width, height));
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: rawDataUrl, fileName: file.name });
          return;
        }

        ctx.drawImage(img, 0, 0, targetW, targetH);
        const outputMime =
          file.type === 'image/png' ? 'image/png' : 'image/webp';
        const optimized = canvas.toDataURL(outputMime, 0.88);
        resolve({ dataUrl: optimized, fileName: file.name });
      };
      img.onerror = () => {
        resolve({ dataUrl: rawDataUrl, fileName: file.name });
      };
      img.src = rawDataUrl;
    };

    reader.readAsDataURL(file);
  });
}

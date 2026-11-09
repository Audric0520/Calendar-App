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

export interface DecodedDataUrlImage {
  blob: Blob;
  contentType: string;
  ext: string;
}

function extensionFromMimeOrName(
  mimeType: string,
  fallbackFileName?: string
): string {
  const cleanMime = mimeType.toLowerCase().trim();
  if (cleanMime === 'image/png') return 'png';
  if (cleanMime === 'image/webp') return 'webp';
  if (cleanMime === 'image/jpeg' || cleanMime === 'image/jpg') return 'jpg';

  if (fallbackFileName) {
    const match = /\.([a-z0-9]+)$/i.exec(fallbackFileName.trim());
    if (match) {
      const ext = match[1].toLowerCase();
      if (ext === 'jpeg') return 'jpg';
      if (ext === 'png' || ext === 'jpg' || ext === 'webp') return ext;
    }
  }

  return 'webp';
}

/**
 * Converts a `data:image/...;base64,...` URL into a binary `Blob`, normalized
 * MIME `contentType`, and file extension (`png` | `jpg` | `webp`).
 */
export function dataUrlToImageBlob(
  dataUrl: string,
  fallbackFileName?: string
): DecodedDataUrlImage {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Invalid image data URL.');
  }

  const rawMime = (match[1] || 'image/webp').toLowerCase();
  const contentType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';

  let bytes: Uint8Array;
  if (isBase64) {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    const decoded = decodeURIComponent(payload);
    bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) {
      bytes[i] = decoded.charCodeAt(i);
    }
  }

  if (bytes.byteLength === 0) {
    throw new Error('Decoded image is empty.');
  }

  const ext = extensionFromMimeOrName(contentType, fallbackFileName);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: contentType });
  return { blob, contentType, ext };
}

export function extractExtensionFromStoragePath(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path.trim());
  if (!match) return 'webp';
  const ext = match[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
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

    if (file.size === 0) {
      reject(
        new Error('Selected image file is empty and could not be decoded.')
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

      // Verify full image decode and gently optimize large images via Canvas
      const img = new Image();
      img.onload = async () => {
        try {
          if (typeof img.decode === 'function') {
            await img.decode();
          }
        } catch {
          reject(
            new Error(
              'Selected file could not be decoded as a valid image.'
            )
          );
          return;
        }

        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height || width <= 0 || height <= 0) {
          reject(
            new Error(
              'Selected file could not be decoded as a valid image.'
            )
          );
          return;
        }

        if (
          width <= maxDimension &&
          height <= maxDimension &&
          file.size <= 1.5 * 1024 * 1024
        ) {
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

        try {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const outputMime =
            file.type === 'image/png' ? 'image/png' : 'image/webp';
          const optimized = canvas.toDataURL(outputMime, 0.88);
          resolve({ dataUrl: optimized, fileName: file.name });
        } catch {
          reject(
            new Error(
              'Selected file could not be decoded as a valid image.'
            )
          );
        }
      };

      img.onerror = () => {
        reject(
          new Error('Selected file could not be decoded as a valid image.')
        );
      };

      img.src = rawDataUrl;
    };

    reader.readAsDataURL(file);
  });
}

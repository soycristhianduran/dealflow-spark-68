/**
 * Image conversion helpers.
 *
 * WhatsApp's Cloud API only accepts a fixed set of image MIME types
 * (image/jpeg, image/png, image/webp).  Modern devices commonly produce
 * other formats — AVIF on newer Android, HEIC on iPhones, etc.
 * This helper re-encodes any unsupported image to JPEG client-side using
 * Canvas, so users don't need to convert manually before uploading.
 */

const WHATSAPP_ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Returns the same file if it's already in an allowed format, or a new
 * JPEG file (re-encoded via Canvas) otherwise.
 *
 * Throws if the browser can't decode the image at all.
 */
export async function ensureWhatsAppCompatibleImage(file: File): Promise<File> {
  if (WHATSAPP_ALLOWED_IMAGE_TYPES.has(file.type)) return file;

  // Try to decode via createImageBitmap (faster + handles AVIF on modern Chrome)
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch (_) {
    // Fallback: HTMLImageElement (slower, more compatible)
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
        i.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas no soportado");
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Conversión a JPEG falló");
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Canvas path with bitmap
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas no soportado en este navegador");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Conversión a JPEG falló");
  return new File(
    [blob],
    file.name.replace(/\.[^.]+$/, "") + ".jpg",
    { type: "image/jpeg" },
  );
}

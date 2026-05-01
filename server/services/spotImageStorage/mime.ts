// Magic bytes detector — Sprint Spot-Screenshots (ADR-057)
//
// Whitelisted: PNG, JPEG, WebP. Outros (GIF, TXT, PDF, RIFF audio) -> null.
// Decisao founder #2: backend usa este resultado como source of truth para
// `image_mime` persistido, ignorando Content-Type do cliente.

export type SpotImageMime = "image/png" | "image/jpeg" | "image/webp";

export function detectMimeFromBuffer(
  buffer: Buffer | null | undefined,
): SpotImageMime | null {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 3) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF (any variant — JFIF/EXIF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP: "RIFF" .... "WEBP" at offset 8
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export function extFromMime(mime: SpotImageMime): "png" | "jpeg" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpeg";
  return "webp";
}

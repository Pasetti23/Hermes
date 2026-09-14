export const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg"] as const;
export const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"] as const;
export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg", // .mp3
  "audio/mp3",
  "audio/mp4", // .mp4 / .m4a container
  "video/mp4", // browsers sometimes report an audio-only .mp4 as video/mp4
  "audio/x-m4a",
] as const;
export const ALLOWED_AUDIO_EXTENSIONS = [".mp3", ".mp4"] as const;
// OpenAI's Whisper transcription endpoint hard-caps uploads at 25MB.
export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

export interface FileValidationResult {
  valid: boolean;
  reason?: string;
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

export function validateImageFile(file: { name: string; type: string; size: number }): FileValidationResult {
  const ext = getExtension(file.name);
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext as (typeof ALLOWED_IMAGE_EXTENSIONS)[number])) {
    return { valid: false, reason: "Formato no soportado. Usá .png, .jpg o .jpeg." };
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return { valid: false, reason: "El tipo de archivo no coincide con una imagen PNG o JPEG válida." };
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { valid: false, reason: `La imagen supera el límite de ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB.` };
  }
  return { valid: true };
}

export function validateAudioFile(file: { name: string; type: string; size: number }): FileValidationResult {
  const ext = getExtension(file.name);
  if (!ALLOWED_AUDIO_EXTENSIONS.includes(ext as (typeof ALLOWED_AUDIO_EXTENSIONS)[number])) {
    return { valid: false, reason: "Formato no soportado. Usá .mp3 o .mp4." };
  }
  if (file.type && !ALLOWED_AUDIO_MIME_TYPES.includes(file.type as (typeof ALLOWED_AUDIO_MIME_TYPES)[number])) {
    return { valid: false, reason: "El tipo de archivo no coincide con un audio MP3 o MP4 válido." };
  }
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    return { valid: false, reason: `El audio supera el límite de ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB.` };
  }
  return { valid: true };
}

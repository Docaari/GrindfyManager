// =============================================================================
// Validacao de Upload de Imagens para Estudos
// Valida formato e tamanho de arquivos de imagem.
// =============================================================================

import { nanoid } from 'nanoid';
import path from 'path';

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function validateStudyImage(file: {
  mimetype: string;
  size: number;
  originalname: string;
}): { valid: true; filename: string } | { valid: false; error: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return { valid: false, error: 'Formato de imagem nao suportado. Use PNG, JPG, JPEG, GIF ou WebP.' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Arquivo excede o tamanho maximo de 5MB.' };
  }

  const ext = path.extname(file.originalname);
  const filename = `${nanoid()}${ext}`;

  return { valid: true, filename };
}

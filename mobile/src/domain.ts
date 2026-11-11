export type ScanStatus = 'preparing' | 'queued' | 'processing' | 'review' | 'approved' | 'error';

export type Scan = {
  id: string;
  batch_id: string;
  original_path: string;
  optimized_path: string;
  thumbnail_path: string;
  width: number;
  height: number;
  bytes: number;
  status: ScanStatus;
  name: string;
  cedula: string;
  document_date: string;
  notes: string;
  raw_text: string;
  ocr_text: string;
  ocr_name: string;
  ocr_cedula: string;
  warnings: string;
  attempts: number;
  error: string;
  created_at: string;
  updated_at: string;
};

export type Settings = { ocrUrl: string; token: string; automatic: boolean };
export type Review = Pick<Scan, 'name' | 'cedula' | 'document_date' | 'notes' | 'raw_text'>;
export type OcrResult = {
  text: string;
  name: string | null;
  cedula: string | null;
  extraction?: { warnings?: string[] };
};

export const statusLabels: Record<ScanStatus, string> = {
  preparing: 'Optimizando',
  queued: 'En cola',
  processing: 'Leyendo texto',
  review: 'Por revisar',
  approved: 'Revisado',
  error: 'Requiere atención',
};

export function normalizeCedula(value: string): string {
  return value.replace(/[\s.-]/g, '');
}

export function validateReview(review: Review, approve: boolean): string | null {
  if (review.name.length > 160 || review.raw_text.length > 50000 || review.notes.length > 4000) {
    return 'Revisa la longitud de los campos.';
  }
  if (review.document_date) {
    const date = new Date(review.document_date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(review.document_date) ||
        !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== review.document_date) {
      return 'Escribe una fecha válida en formato AAAA-MM-DD.';
    }
  }
  if (approve && !review.name.trim()) return 'Completa el nombre antes de marcar como revisado.';
  if (approve && !/^\d{10}$/.test(normalizeCedula(review.cedula))) {
    return 'Revisa la cédula de 10 dígitos. Puedes guardar un borrador si falta.';
  }
  return null;
}

export function imageSize(width: number, height: number, maxEdge = 3000) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function validateEndpoint(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Usa la URL HTTP o HTTPS del servicio, sin credenciales ni parámetros.');
  }
  if (!url.pathname.endsWith('/extract')) throw new Error('La URL debe terminar en /extract.');
  return url.toString();
}

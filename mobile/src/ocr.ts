import { fetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import type { OcrResult, Scan, Settings } from './domain';
import { validateEndpoint } from './domain';
import { localFile } from './images';

export const defaultSettings: Settings = { ocrUrl: '', token: '', automatic: true };

export async function loadSettings(): Promise<Settings> {
  const saved = await SecureStore.getItemAsync('optical-flow-settings');
  if (!saved) return defaultSettings;
  try { return { ...defaultSettings, ...JSON.parse(saved) }; }
  catch { return defaultSettings; }
}

export async function storeSettings(settings: Settings) {
  if (settings.ocrUrl) {
    validateEndpoint(settings.ocrUrl);
    if (!settings.token.trim()) throw new Error('Completa el token del servicio OCR.');
  }
  await SecureStore.setItemAsync('optical-flow-settings', JSON.stringify(settings));
}

export async function recognize(scan: Scan, settings: Settings): Promise<OcrResult> {
  const url = validateEndpoint(settings.ocrUrl);
  const file = localFile(scan.optimized_path);
  if (!file.exists) throw new Error('La imagen optimizada no está disponible.');
  if (file.size > 8 * 1024 * 1024) throw new Error('La imagen supera los 8 MB del servicio. Revisa el original.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer ' + settings.token },
      body: file,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('El servicio OCR respondió ' + response.status + '. Revisa la conexión y el token.');
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || !('text' in value) ||
        typeof value.text !== 'string' || value.text.length > 50000) {
      throw new Error('El servicio devolvió una respuesta inválida.');
    }
    const result = value as Record<string, unknown>;
    const extraction = result.extraction as { warnings?: unknown } | undefined;
    return {
      text: value.text,
      name: typeof result.name === 'string' ? result.name.slice(0, 160) : null,
      cedula: typeof result.cedula === 'string' ? result.cedula.slice(0, 30) : null,
      extraction: { warnings: Array.isArray(extraction?.warnings) ? extraction.warnings.filter((item): item is string => typeof item === 'string') : [] },
    };
  } finally { clearTimeout(timer); }
}

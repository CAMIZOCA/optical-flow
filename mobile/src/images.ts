import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { addScan, failScan, getScan, markPrepared } from './database';
import { imageSize } from './domain';

const root = new Directory(Paths.document, 'scans');

export function localFile(path: string) { return new File(root, path); }
export function imageUri(path: string) { return localFile(path).uri; }

export async function captureImage(source: { uri: string; width: number; height: number }, batch: string): Promise<string> {
  const id = Crypto.randomUUID();
  const directory = new Directory(root, id);
  directory.create({ intermediates: true, idempotent: true });
  const extension = source.uri.split('?')[0].match(/\.(jpe?g|png|heic|heif|webp)$/i)?.[1].toLowerCase() ?? 'jpg';
  const originalPath = id + '/original.' + extension;
  await new File(source.uri).copy(localFile(originalPath));
  // Record the durable original before starting transformations or network requests.
  await addScan(id, batch, originalPath, source.width, source.height);
  try { await prepareImage(id); }
  catch (error) {
    await failScan(id, error instanceof Error ? error.message : 'No se pudo optimizar la imagen.');
  }
  return id;
}

async function replaceFile(from: string, destination: File) {
  if (destination.exists) destination.delete();
  await new File(from).copy(destination);
}

export async function prepareImage(id: string) {
  const scan = await getScan(id);
  const context = ImageManipulator.manipulate(imageUri(scan.original_path));
  const dimensions = imageSize(scan.width, scan.height);
  context.resize(dimensions);
  const rendered = await context.renderAsync();
  const optimized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
  const optimizedPath = id + '/optimized.jpg';
  await replaceFile(optimized.uri, localFile(optimizedPath));

  const preview = ImageManipulator.manipulate(optimized.uri);
  preview.resize(imageSize(optimized.width, optimized.height, 320));
  const previewImage = await preview.renderAsync();
  const thumbnail = await previewImage.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
  const thumbnailPath = id + '/thumbnail.jpg';
  await replaceFile(thumbnail.uri, localFile(thumbnailPath));

  await markPrepared(id, optimizedPath, thumbnailPath, optimized.width, optimized.height, localFile(optimizedPath).size);
}

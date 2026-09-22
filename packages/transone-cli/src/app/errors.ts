import { basename } from 'node:path';

export function nativeError(filePath: string, message: string): Error {
  return new Error(`[transone app] ${basename(filePath)}: ${message}`);
}

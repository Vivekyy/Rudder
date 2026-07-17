import { readFileSync } from 'node:fs';

export function svgIcon(): string {
  for (const url of [
    new URL('../assets/rudder-icon.svg', import.meta.url),
    new URL('../../assets/rudder-icon.svg', import.meta.url),
  ]) {
    try {
      return readFileSync(url, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  throw new Error('rudder icon asset not found');
}

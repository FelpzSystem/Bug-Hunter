import { readFile } from 'node:fs/promises';

export async function readConfig(file: string) {
  const contents = await readFile(file, 'utf8');
  return JSON.parse(contents) as Record<string, unknown>;
}

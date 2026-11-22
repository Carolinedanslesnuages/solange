/**
 * Weighs a built site (a folder): every file, grouped by kind, in compressed size, the way it
 * travels over the network. Text files (JS, CSS, HTML, SVG…) are measured gzipped; images and
 * fonts are already compressed and are measured as they are.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Kinds of files. Kind ids are public (solange.json, --json): they stay in French. */
export const KINDS = {
  js: ['.js', '.mjs', '.cjs'],
  css: ['.css'],
  html: ['.html', '.htm'],
  images: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'],
  polices: ['.woff', '.woff2', '.ttf', '.otf', '.eot'],
};
export const KIND_LABELS = { js: 'JavaScript', css: 'CSS', html: 'HTML', images: 'Images', polices: 'Polices', autres: 'Autres', total: 'Total' };
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.htm', '.svg', '.json', '.txt', '.xml', '.map', '.webmanifest']);

export function kindOf(path) {
  const extension = extname(path).toLowerCase();
  return Object.keys(KINDS).find((kind) => KINDS[kind].includes(extension)) || 'autres';
}

/** Size on the network: gzipped for text, as is for already compressed files. */
export function transferSize(path) {
  const content = readFileSync(path);
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase()) ? gzipSync(content, { level: 9 }).length : content.length;
}

function listFiles(folder) {
  const files = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/**
 * Weighs a folder. Source maps are left out: browsers only fetch them with the developer tools open.
 * @returns {{ kinds: Record<string, number>, files: { path: string, kind: string, bytes: number }[] }}
 */
export function weighFolder(folder) {
  let stats;
  try {
    stats = statSync(folder);
  } catch {
    throw new Error(`Dossier introuvable : ${folder}. Construisez le site, ou indiquez le bon dossier avec --dossier.`);
  }
  if (!stats.isDirectory()) throw new Error(`${folder} n'est pas un dossier.`);
  const files = listFiles(folder)
    .filter((path) => !path.endsWith('.map'))
    .map((path) => ({ path: relative(folder, path).split(sep).join('/'), kind: kindOf(path), bytes: transferSize(path) }))
    .sort((left, right) => right.bytes - left.bytes);
  const kinds = Object.fromEntries([...Object.keys(KINDS), 'autres'].map((kind) => [kind, 0]));
  for (const file of files) kinds[file.kind] += file.bytes;
  kinds.total = files.reduce((total, file) => total + file.bytes, 0);
  return { kinds, files };
}

/** "12,3 Ko" — kilobytes of 1 000 bytes, the unit people meet in browsers and on disks. */
export function formatBytes(bytes) {
  const french = (number, decimals) => number.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (Math.abs(bytes) >= 1e6) return `${french(bytes / 1e6, 2)} Mo`;
  if (Math.abs(bytes) >= 1e3) return `${french(bytes / 1e3, 1)} Ko`;
  return `${bytes} o`;
}

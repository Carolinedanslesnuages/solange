/**
 * The first visit: what the entry page (index.html) downloads on arrival, without the chunks a
 * framework loads later (another page, a project opened…). It follows the page's scripts, style
 * sheets and preloads, then what those style sheets call (@import, fonts, images).
 * Scripts are not read: a chunk imported by code is counted only when the page preloads it,
 * which is what Vite does for the static imports of the entry.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { cssReferences, htmlReferences, isExternal } from './references.mjs';
import { transferSize } from './measure.mjs';

/** Local file of an address seen in fromFile (both relative to the site folder), or null. */
function localPath(folder, fromFile, reference) {
  if (isExternal(reference) || /^[a-z]+:/i.test(reference)) return null;
  const clean = decodeURI(reference.split(/[?#]/)[0]);
  if (!clean) return null;
  const candidates = clean.startsWith('/')
    ? [clean.slice(1), clean.split('/').slice(2).join('/')] // site at the root, or under a base path (/repo/…)
    : [posix.join(posix.dirname(fromFile), clean)];
  return candidates.find((candidate) => candidate && existsSync(join(folder, candidate))) || null;
}

/**
 * @returns {{ bytes: number, files: { path: string, bytes: number }[] } | null} null without an entry page
 */
export function weighFirstVisit(folder, entry = 'index.html') {
  if (!existsSync(join(folder, entry))) return null;
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const current = queue.shift();
    const content = /\.(css|html?)$/i.test(current) ? readFileSync(join(folder, current), 'utf8') : '';
    const references = /\.css$/i.test(current) ? cssReferences(content) : /\.html?$/i.test(current) ? htmlReferences(content) : [];
    for (const reference of references) {
      const path = localPath(folder, current, reference);
      if (path && !seen.has(path)) {
        seen.add(path);
        queue.push(path);
      }
    }
  }
  const files = [...seen].map((path) => ({ path, bytes: transferSize(join(folder, path)) })).sort((left, right) => right.bytes - left.bytes);
  return { bytes: files.reduce((total, file) => total + file.bytes, 0), files };
}


/**
 * Resources the built site loads from other sites (fonts, scripts, style sheets from a CDN…).
 * Solange cannot weigh them, yet each one is one more request, more bytes, and a visit that
 * another site sees. They are reported as warnings, grouped by site.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { cssReferences, htmlReferences, hostOf, isExternal } from './references.mjs';

function textFiles(folder) {
  const files = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...textFiles(path));
    else if (/\.(html?|css)$/i.test(entry.name)) files.push(path);
  }
  return files;
}

/** @returns {{ host: string, addresses: string[], files: string[] }[]} sorted by host */
export function externalResources(folder) {
  const byHost = new Map();
  for (const path of textFiles(folder)) {
    const content = readFileSync(path, 'utf8');
    const references = /\.css$/i.test(path) ? cssReferences(content) : htmlReferences(content);
    for (const reference of references.filter(isExternal)) {
      const host = hostOf(reference);
      if (!byHost.has(host)) byHost.set(host, { host, addresses: new Set(), files: new Set() });
      byHost.get(host).addresses.add(reference.startsWith('//') ? `https:${reference}` : reference);
      byHost.get(host).files.add(relative(folder, path).split(sep).join('/'));
    }
  }
  return [...byHost.values()]
    .map((group) => ({ host: group.host, addresses: [...group.addresses].sort(), files: [...group.files].sort() }))
    .sort((left, right) => left.host.localeCompare(right.host));
}

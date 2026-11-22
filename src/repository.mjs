/**
 * What the pull request adds to the repository itself: heavy images, and the install weight of new
 * dependencies (read from the public npm registry, no token needed).
 */
import { execFileSync } from 'node:child_process';
import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?)$/i;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const REGISTRY = process.env.SOLANGE_REGISTRY || 'https://registry.npmjs.org';
const runGit = (args, folder) => execFileSync('git', args, { cwd: folder, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Images added or changed since the base and heavier than the limit (in Ko). */
export function heavyImages(folder, base, limitKo) {
  return runGit(['diff', '--name-only', '--diff-filter=AM', base, 'HEAD'], folder)
    .split('\n')
    .filter((path) => IMAGE_FILE.test(path))
    .map((path) => ({ path, bytes: statSync(join(folder, path)).size }))
    .filter((image) => image.bytes > limitKo * 1000);
}

function manifestAt(folder, revision, path) {
  try {
    return JSON.parse(revision ? runGit(['show', `${revision}:${path}`], folder) : readFileSync(join(folder, path), 'utf8'));
  } catch {
    return {};
  }
}

/** Dependencies added to any package.json since the base: [{ name, version, manifestPath, field }]. */
export function addedDependencies(folder, base) {
  const manifests = runGit(['diff', '--name-only', base, 'HEAD'], folder).split('\n').filter((path) => /(^|\/)package\.json$/.test(path));
  return manifests.flatMap((manifestPath) => {
    const before = manifestAt(folder, base, manifestPath);
    const after = manifestAt(folder, null, manifestPath);
    return DEPENDENCY_FIELDS.flatMap((field) => Object.entries(after[field] || {})
      .filter(([name]) => !DEPENDENCY_FIELDS.some((otherField) => before[otherField] && before[otherField][name]))
      .map(([name, version]) => ({ name, version: String(version).replace(/^[\^~]/, ''), manifestPath, field })));
  });
}

/** Unpacked size of a published version, or null when unknown (Git dependency, registry down…). */
export async function installSize(name, version) {
  try {
    const response = await fetch(`${REGISTRY}/${name.replace('/', '%2F')}`, { headers: { Accept: 'application/json', 'User-Agent': 'solange' } });
    if (!response.ok) return null;
    const metadata = await response.json();
    const manifest = metadata.versions && (metadata.versions[version] || metadata.versions[metadata['dist-tags'] && metadata['dist-tags'].latest]);
    return manifest && manifest.dist && Number.isFinite(manifest.dist.unpackedSize) ? manifest.dist.unpackedSize : null;
  } catch {
    return null;
  }
}

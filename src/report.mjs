/** The report, as text for the terminal or Markdown for a pull request (in French). */
import { KIND_LABELS, formatBytes } from './measure.mjs';

const difference = (kindRow) => {
  if (kindRow.baseBytes === null) return '';
  const delta = kindRow.bytes - kindRow.baseBytes;
  return delta === 0 ? '=' : `${delta > 0 ? '+' : '−'}${formatBytes(Math.abs(delta))}`;
};
const budgetCell = (kindRow) => (kindRow.budgetBytes === null ? '' : `${formatBytes(kindRow.budgetBytes)}${kindRow.overBudget ? ' ✗' : ' ✓'}`);

const externalAdvice = 'Solange ne peut pas les peser. Chacune ajoute une requête, des octets, et une visite que cet autre site voit : héberger le fichier avec le site, si la licence le permet, évite les trois.';

export function toMarkdown({ result, withBase, heaviestFiles, images, dependencies, external = [], entry = 'index.html' }) {
  const lines = ['## Poids du site (Solange)', ''];
  lines.push(`| Genre | Poids${withBase ? ' | Avant | Écart' : ''} | Budget |`, `|---|---|${withBase ? '---|---|' : ''}---|`);
  for (const kindRow of result.rows) {
    lines.push(`| ${KIND_LABELS[kindRow.kind]} | ${formatBytes(kindRow.bytes)}${withBase ? ` | ${formatBytes(kindRow.baseBytes)} | ${difference(kindRow)}` : ''} | ${budgetCell(kindRow)} |`);
  }
  lines.push('', `<sub>Tailles compressées, comme elles voyagent sur le réseau. Première visite : ce que \`${entry}\` télécharge en arrivant.</sub>`);
  if (result.problems.length) lines.push('', '### À revoir', '', ...result.problems.map((problem) => `- ${problem}`));
  if (images.length) lines.push('', '### Images lourdes ajoutées', '', ...images.map((image) => `- \`${image.path}\` : ${formatBytes(image.bytes)}. Une version WebP ou AVIF, à la taille affichée, pèse souvent bien moins.`));
  if (dependencies.length) {
    lines.push('', '### Nouvelles dépendances', '', ...dependencies.map((dependency) => `- \`${dependency.name}\` ${dependency.version} : ${dependency.bytes === null ? 'poids inconnu' : `${formatBytes(dependency.bytes)} une fois installée`}${dependency.field === 'devDependencies' ? ' (développement seulement)' : ''}`));
  }
  if (external.length) {
    lines.push('', '### Ressources chargées depuis d\'autres sites', '', externalAdvice, '', ...external.map((group) => `- **${group.host}** : ${group.addresses.length} adresse(s), dans ${group.files.map((file) => `\`${file}\``).join(', ')}`));
  }
  if (heaviestFiles.length) lines.push('', '<details><summary>Fichiers les plus lourds</summary>', '', ...heaviestFiles.map((file) => `- \`${file.path}\` : ${formatBytes(file.bytes)}`), '', '</details>');
  return lines.join('\n');
}

export function toText({ result, withBase, heaviestFiles, images, dependencies, external = [] }, { highlight = (text) => text, muted = (text) => text } = {}) {
  const lines = [highlight('Poids du site') + muted(' (compressé, comme sur le réseau)')];
  const width = Math.max(...result.rows.map((kindRow) => KIND_LABELS[kindRow.kind].length));
  for (const kindRow of result.rows) {
    const cells = [KIND_LABELS[kindRow.kind].padEnd(width), formatBytes(kindRow.bytes).padStart(10)];
    if (withBase) cells.push(muted(`avant ${formatBytes(kindRow.baseBytes)}`.padEnd(16)), difference(kindRow).padStart(10));
    if (kindRow.budgetBytes !== null) cells.push(muted(`budget ${budgetCell(kindRow)}`));
    lines.push(`  ${cells.join('  ')}`);
  }
  if (result.problems.length) lines.push('', highlight('À revoir'), ...result.problems.map((problem) => `  ✗ ${problem}`));
  if (images.length) lines.push('', highlight('Images lourdes ajoutées'), ...images.map((image) => `  ⚠ ${image.path} : ${formatBytes(image.bytes)}`));
  if (dependencies.length) lines.push('', highlight('Nouvelles dépendances'), ...dependencies.map((dependency) => `  · ${dependency.name} ${dependency.version} : ${dependency.bytes === null ? 'poids inconnu' : formatBytes(dependency.bytes)}`));
  if (external.length) lines.push('', highlight("Ressources chargées depuis d'autres sites") + muted(' (non pesées)'), ...external.map((group) => `  ⚠ ${group.host} : ${group.addresses.length} adresse(s), dans ${group.files.join(', ')}`));
  if (heaviestFiles.length) lines.push('', highlight('Fichiers les plus lourds'), ...heaviestFiles.map((file) => `  ${formatBytes(file.bytes).padStart(10)}  ${file.path}`));
  return lines.join('\n');
}

/**
 * Budgets (solange.json) and the verdict of a measurement. Budgets are in kilobytes (Ko, 1 000
 * bytes) of network size, per kind; any kind may be left out.
 *
 *   { "dossier": "dist", "entree": "index.html",
 *     "budgets": { "js": 200, "css": 50, "images": 500, "total": 1000, "premiere-visite": 150 },
 *     "imageMax": 200, "hausseMax": 10 }
 *
 * premiere-visite: what the entry page downloads on arrival (see first-visit.mjs).
 * hausseMax: largest increase allowed in one pull request, in percent of the total (with a base).
 */
import { readFileSync, existsSync } from 'node:fs';
import { KIND_LABELS, formatBytes } from './measure.mjs';

export const DEFAULT_SETTINGS = { dossier: 'dist', entree: 'index.html', budgets: {}, imageMax: 200, hausseMax: null };

export function readSettings(path) {
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS };
  try {
    const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(path, 'utf8')) };
    for (const [kind, limit] of Object.entries(settings.budgets)) {
      if (!KIND_LABELS[kind] || kind === 'autres') throw new Error(`budget inconnu « ${kind} » (possibles : js, css, html, images, polices, total, premiere-visite)`);
      if (!Number.isFinite(limit) || limit <= 0) throw new Error(`le budget « ${kind} » doit être un nombre de Ko positif`);
    }
    return settings;
  } catch (error) {
    throw new Error(`${path} illisible : ${error.message}`);
  }
}

/**
 * Compares a measurement with the budgets and, when given, the base measurement.
 * @returns {{ rows: { kind, bytes, baseBytes, budgetBytes, overBudget }[], problems: string[] }}
 */
export function verdict(measurement, settings, baseMeasurement = null) {
  const rows = Object.keys(KIND_LABELS)
    .filter((kind) => measurement.kinds[kind] || (baseMeasurement && baseMeasurement.kinds[kind]) || settings.budgets[kind])
    .map((kind) => {
      const budgetBytes = settings.budgets[kind] ? settings.budgets[kind] * 1000 : null;
      const bytes = measurement.kinds[kind] || 0;
      return { kind, bytes, baseBytes: baseMeasurement ? baseMeasurement.kinds[kind] || 0 : null, budgetBytes, overBudget: budgetBytes !== null && bytes > budgetBytes };
    });
  const problems = rows.filter((kindRow) => kindRow.overBudget).map((kindRow) => `${KIND_LABELS[kindRow.kind]} : ${formatBytes(kindRow.bytes)}, au-dessus du budget de ${formatBytes(kindRow.budgetBytes)}.`);
  if (baseMeasurement && settings.hausseMax !== null && baseMeasurement.kinds.total > 0) {
    const increase = ((measurement.kinds.total - baseMeasurement.kinds.total) / baseMeasurement.kinds.total) * 100;
    if (increase > settings.hausseMax) problems.push(`Le site grossit de ${increase.toFixed(1).replace('.', ',')} % dans cette PR (au plus ${settings.hausseMax} %).`);
  }
  return { rows, problems };
}

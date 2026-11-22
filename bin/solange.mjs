#!/usr/bin/env node
/** Solange: the weight of a site, checked on every pull request. */
import { resolve } from 'node:path';
import { weighFolder, KIND_LABELS } from '../src/measure.mjs';
import { weighFirstVisit } from '../src/first-visit.mjs';
import { externalResources } from '../src/external.mjs';
import { readSettings, verdict } from '../src/budgets.mjs';
import { heavyImages, addedDependencies, installSize } from '../src/repository.mjs';
import { toMarkdown, toText } from '../src/report.mjs';

const HELP = `Solange · le poids du site, vérifié à chaque pull request

Usage : solange [options]

  Pèse le site construit (JavaScript, CSS, HTML, images, polices), en taille compressée,
  comme il voyage sur le réseau, et le compare aux budgets de solange.json. Donne aussi le
  poids de la première visite (ce que la page d'entrée télécharge en arrivant), et signale
  les ressources chargées depuis d'autres sites, que Solange ne peut pas peser.

  --dossier <chemin>        site construit (défaut : dist, ou « dossier » de solange.json)
  --base-dossier <chemin>   le même site construit depuis la branche principale, pour l'écart
  --base <ref>              branche ou commit de départ : images lourdes et nouvelles dépendances
  --config <fichier>        budgets (défaut : ./solange.json)
  --markdown | --json       autre format de sortie
  --aide                    cette aide

Code de sortie : 1 si un budget est dépassé ou si une image ajoutée est trop lourde.`;

function parseOptions(args) {
  const options = { config: 'solange.json' };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === 'verifier') continue;
    if (['aide', '--aide', '-h', '--help'].includes(argument)) options.help = true;
    else if (argument === '--dossier') options.folder = args[++index];
    else if (argument === '--base-dossier') options.baseFolder = args[++index];
    else if (argument === '--base') options.base = args[++index];
    else if (argument === '--config') options.config = args[++index];
    else if (argument === '--markdown') options.markdown = true;
    else if (argument === '--json') options.json = true;
    else throw new Error(`Option inconnue : ${argument}. Tapez « solange --aide ».`);
  }
  return options;
}

/** The weight of a built site, per kind, plus its first visit when it has an entry page. */
function weighSite(folder, entry) {
  const measurement = weighFolder(folder);
  const firstVisit = weighFirstVisit(folder, entry);
  if (firstVisit) measurement.kinds['premiere-visite'] = firstVisit.bytes;
  return { ...measurement, firstVisit };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) return console.log(HELP);
  const settings = readSettings(resolve(options.config));
  const siteFolder = resolve(options.folder || settings.dossier);
  const measurement = weighSite(siteFolder, settings.entree);
  const baseMeasurement = options.baseFolder ? weighSite(resolve(options.baseFolder), settings.entree) : null;
  const external = externalResources(siteFolder);
  const result = verdict(measurement, settings, baseMeasurement);
  const images = options.base ? heavyImages(process.cwd(), options.base, settings.imageMax) : [];
  const dependencies = options.base
    ? await Promise.all(addedDependencies(process.cwd(), options.base).map(async (dependency) => ({ ...dependency, bytes: await installSize(dependency.name, dependency.version) })))
    : [];
  const report = { result, withBase: !!baseMeasurement, heaviestFiles: measurement.files.slice(0, 5), images, dependencies, external, entry: settings.entree };
  const failed = result.problems.length > 0 || images.length > 0;
  if (options.json) {
    console.log(JSON.stringify({
      genres: result.rows.map((kindRow) => ({ genre: kindRow.kind, octets: kindRow.bytes, avant: kindRow.baseBytes, budget: kindRow.budgetBytes, depasse: kindRow.overBudget })),
      problemes: result.problems,
      images: images.map((image) => ({ fichier: image.path, octets: image.bytes })),
      dependances: dependencies.map((dependency) => ({ nom: dependency.name, version: dependency.version, octets: dependency.bytes })),
      premiereVisite: measurement.firstVisit ? measurement.firstVisit.files.map((file) => ({ fichier: file.path, octets: file.bytes })) : null,
      externes: external.map((group) => ({ site: group.host, adresses: group.addresses, fichiers: group.files })),
      echec: failed,
    }, null, 2));
  } else if (options.markdown) console.log(toMarkdown(report));
  else {
    const colors = process.stdout.isTTY && !process.env.NO_COLOR;
    const paint = (code) => (text) => (colors ? `\x1b[${code}m${text}\x1b[0m` : text);
    console.log(toText(report, { highlight: paint('1;38;5;108'), muted: paint('2') }));
  }
  if (process.env.GITHUB_ACTIONS) {
    for (const problem of result.problems) console.log(`::error title=Solange · poids du site::${problem}`);
    for (const image of images) console.log(`::error file=${image.path},title=Solange · image lourde::${image.path} pèse ${Math.round(image.bytes / 1000)} Ko (au plus ${settings.imageMax} Ko).`);
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`solange : ${error.message}`);
  process.exit(1);
});

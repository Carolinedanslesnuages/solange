import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { weighFolder, kindOf, formatBytes } from '../src/measure.mjs';
import { verdict } from '../src/budgets.mjs';

const BINARY = fileURLToPath(new URL('../bin/solange.mjs', import.meta.url));

function folderWith(files) {
  const folder = mkdtempSync(join(tmpdir(), 'solange-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  return folder;
}

/** Varied text compresses less, like real code. */
const code = (size) => Array.from({ length: size / 20 }, (unused, index) => `let value${index}=${index * 7919};\n`).join('');

// Asynchronous on purpose: the fake registry runs in this same process.
const runCli = (args, { cwd, env = {} } = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, [BINARY, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '', ...env } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  child.on('close', (status) => resolve({ status, stdout, stderr }));
});

test('genres de fichiers et unités', () => {
  assert.equal(kindOf('assets/app.js'), 'js');
  assert.equal(kindOf('logo.SVG'), 'images');
  assert.equal(kindOf('fonts/a.woff2'), 'polices');
  assert.equal(kindOf('robots.txt'), 'autres');
  assert.equal(formatBytes(950), '950 o');
  assert.equal(formatBytes(12345), '12,3 Ko');
  assert.equal(formatBytes(2500000), '2,50 Mo');
});

test('poids : texte compressé, images telles quelles, cartes de source ignorées', () => {
  const folder = folderWith({ 'index.html': '<p>' + 'a'.repeat(5000) + '</p>', 'app.js': code(20000), 'app.js.map': code(50000), 'photo.jpg': Buffer.alloc(30000, 7) });
  const { kinds, files } = weighFolder(folder);
  assert.ok(kinds.html < 200, `HTML compressé : ${kinds.html}`);
  assert.equal(kinds.images, 30000, 'une image n’est pas recompressée');
  assert.ok(!files.some((file) => file.path.endsWith('.map')));
  assert.equal(kinds.total, kinds.html + kinds.js + kinds.images);
});

test('budgets et écart avec la branche principale', () => {
  const current = { kinds: { js: 250000, css: 10000, html: 0, images: 0, polices: 0, autres: 0, total: 260000 } };
  const base = { kinds: { js: 200000, css: 10000, html: 0, images: 0, polices: 0, autres: 0, total: 210000 } };
  const result = verdict(current, { budgets: { js: 200, total: 1000 }, hausseMax: 10 }, base);
  assert.deepEqual(result.problems, ['JavaScript : 250,0 Ko, au-dessus du budget de 200,0 Ko.', 'Le site grossit de 23,8 % dans cette PR (au plus 10 %).']);
  assert.equal(result.rows.find((kindRow) => kindRow.kind === 'js').baseBytes, 200000);
  assert.deepEqual(verdict(current, { budgets: {}, hausseMax: null }).problems, []);
});

test('commande : budget dépassé, Markdown, JSON, réglage invalide', async () => {
  const site = folderWith({ 'index.html': '<p>x</p>', 'assets/app.js': code(60000) });
  const config = join(site, 'solange.json');
  writeFileSync(config, JSON.stringify({ dossier: '.', budgets: { js: 5 } }));
  const over = await runCli(['--config', config, '--dossier', site]);
  assert.equal(over.status, 1);
  assert.match(over.stdout, /JavaScript +[\d,]+ Ko +budget 5,0 Ko ✗/);
  const markdown = await runCli(['--config', config, '--dossier', site, '--markdown']);
  assert.match(markdown.stdout, /\| JavaScript \| [\d,]+ Ko \| 5,0 Ko ✗ \|/);
  assert.match(markdown.stdout, /### À revoir\n\n- JavaScript/);
  const json = JSON.parse((await runCli(['--config', config, '--dossier', site, '--json'])).stdout);
  assert.deepEqual(Object.keys(json), ['genres', 'problemes', 'images', 'dependances', 'echec']);
  assert.equal(json.echec, true);
  writeFileSync(config, JSON.stringify({ budgets: { gifs: 10 } }));
  assert.match((await runCli(['--config', config, '--dossier', site])).stderr, /budget inconnu « gifs »/);
  assert.match((await runCli(['--dossier', '/nulle/part'])).stderr, /Dossier introuvable/);
});

test('écart avec le site construit depuis la branche principale', async () => {
  const before = folderWith({ 'app.js': code(20000) });
  const after = folderWith({ 'app.js': code(40000) });
  const result = await runCli(['--dossier', after, '--base-dossier', before, '--markdown']);
  assert.match(result.stdout, /\| JavaScript \| [\d,]+ Ko \| [\d,]+ Ko \| \+[\d,]+ Ko \|/);
});

test('images lourdes ajoutées et poids des nouvelles dépendances', async () => {
  const registry = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ 'dist-tags': { latest: '4.17.21' }, versions: { '4.17.21': { dist: { unpackedSize: 1412415 } } } }));
  });
  await new Promise((resolve) => registry.listen(0, resolve));
  try {
    const repository = folderWith({ 'package.json': JSON.stringify({ dependencies: { vue: '3.5.0' } }), 'dist/index.html': '<p>x</p>' });
    const runGit = (...args) => execFileSync('git', args, { cwd: repository, stdio: 'ignore' });
    runGit('init', '-q', '-b', 'main');
    runGit('config', 'user.email', 'essai@exemple.fr');
    runGit('config', 'user.name', 'essai');
    runGit('add', '-A');
    runGit('commit', '-q', '-m', 'base');
    writeFileSync(join(repository, 'photo.png'), Buffer.alloc(350000, 1));
    writeFileSync(join(repository, 'petite.png'), Buffer.alloc(1000, 1));
    writeFileSync(join(repository, 'package.json'), JSON.stringify({ dependencies: { vue: '3.5.0', lodash: '^4.17.21' } }));
    runGit('add', '-A');
    runGit('commit', '-q', '-m', 'ajouts');
    const result = await runCli(['--dossier', 'dist', '--base', 'HEAD~1', '--markdown'], { cwd: repository, env: { SOLANGE_REGISTRY: `http://127.0.0.1:${registry.address().port}` } });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /### Images lourdes ajoutées\n\n- `photo\.png` : 350,0 Ko/);
    assert.doesNotMatch(result.stdout, /petite\.png/);
    assert.match(result.stdout, /### Nouvelles dépendances\n\n- `lodash` 4\.17\.21 : 1,41 Mo une fois installée/);
    const annotated = await runCli(['--dossier', 'dist', '--base', 'HEAD~1'], { cwd: repository, env: { GITHUB_ACTIONS: 'true', SOLANGE_REGISTRY: `http://127.0.0.1:${registry.address().port}` } });
    assert.match(annotated.stdout, /::error file=photo\.png,title=Solange · image lourde::photo\.png pèse 350 Ko \(au plus 200 Ko\)\./);
  } finally {
    registry.close();
  }
});

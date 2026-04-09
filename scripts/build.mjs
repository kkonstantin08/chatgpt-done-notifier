import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

const entryPoints = [
  'src/background/service-worker.ts',
  'src/content/chatgpt-observer.ts',
  'src/popup/popup.ts',
  'src/options/options.ts',
  'src/offscreen/offscreen.ts'
];

const moduleCache = new Map();

function normalizeModuleId(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/').replace(/\.ts$/, '');
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    throw new Error(`Only relative imports are supported. Found "${specifier}" in ${fromFile}`);
  }

  return path.resolve(path.dirname(fromFile), `${specifier}.ts`);
}

async function loadModule(filePath) {
  const normalizedPath = path.normalize(filePath);
  if (moduleCache.has(normalizedPath)) {
    return;
  }

  const source = await fs.readFile(normalizedPath, 'utf8');
  const importMatches = [...source.matchAll(/from\s+['"](.+?)['"]/g)];

  for (const [, specifier] of importMatches) {
    if (specifier.startsWith('.')) {
      await loadModule(resolveImport(normalizedPath, specifier));
    }
  }

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      lib: ['ES2022', 'DOM', 'WebWorker'],
      strict: true
    },
    fileName: normalizedPath
  });

  moduleCache.set(normalizedPath, {
    id: normalizeModuleId(normalizedPath),
    code: transpiled.outputText
  });
}

async function bundleEntry(entryRelativePath) {
  const entryPath = path.join(rootDir, entryRelativePath);
  await loadModule(entryPath);

  const modulesCode = [...moduleCache.values()]
    .map((moduleInfo) => {
      return `'${moduleInfo.id}': function (module, exports, require) {\n${moduleInfo.code}\n}`;
    })
    .join(',\n');

  const bundle = `(() => {
const __modules = {
${modulesCode}
};
const __cache = {};
function __resolve(fromId, specifier) {
  if (!specifier.startsWith('.')) {
    return specifier;
  }
  const fromParts = fromId.split('/');
  fromParts.pop();
  for (const part of specifier.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      fromParts.pop();
      continue;
    }
    fromParts.push(part);
  }
  return fromParts.join('/');
}
function __require(id) {
  if (__cache[id]) {
    return __cache[id].exports;
  }
  const factory = __modules[id];
  if (!factory) {
    throw new Error('Module not found: ' + id);
  }
  const module = { exports: {} };
  __cache[id] = module;
  factory(module, module.exports, (specifier) => __require(__resolve(id, specifier)));
  return module.exports;
}
__require('${normalizeModuleId(entryPath)}');
})();`;

  const outputPath = path.join(distDir, entryRelativePath.replace(/\.ts$/, '.js'));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bundle, 'utf8');
}

async function copyStaticTree(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(directory, entry.name);
    const relativePath = path.relative(rootDir, sourcePath);
    const targetPath = path.join(distDir, relativePath);

    if (entry.isDirectory()) {
      await copyStaticTree(sourcePath);
      continue;
    }

    if (entry.name.endsWith('.ts')) {
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
  }
}

async function build() {
  await fs.rm(distDir, { recursive: true, force: true });
  await copyStaticTree(srcDir);
  await fs.copyFile(path.join(rootDir, 'manifest.json'), path.join(distDir, 'manifest.json'));

  for (const entry of entryPoints) {
    moduleCache.clear();
    await bundleEntry(entry);
  }
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

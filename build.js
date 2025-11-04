#!/usr/bin/env node
/* build.js - node build.js [all|cjs|esm|types|clean] */
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const DIST_DIR = 'dist';

/* ------------------------- utils ------------------------- */
function readJSONSafe(file, fallback = {}) {
  try {
    const p = path.resolve(process.cwd(), file);
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}
function uniq(arr) { return Array.from(new Set(arr)); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rimraf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

function depsAsExternal(pkg) {
  const dep = Object.keys(pkg.dependencies || {});
  const peer = Object.keys(pkg.peerDependencies || {});
  const names = uniq([...dep, ...peer]);
  // 覆盖子路径导入（lodash/fp、react/jsx-runtime）
  return uniq(names.flatMap((n) => [n, `${n}/*`]));
}
function nodeBuiltinsExternal() {
  // 既包含 'fs' 也包含 'node:fs' 形式
  return uniq([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
}
async function loadEsbuild() {
  try { return require('esbuild'); }
  catch { const mod = await import('esbuild'); return mod.build ? mod : mod.default; }
}
function tsconfigPath() { return fs.existsSync('tsconfig.json') ? 'tsconfig.json' : undefined; }
function entryPointsFromPkg(/*pkg*/) { return ['index.ts']; }

/* ------------------------- esbuild builds ------------------------- */
async function buildOne(format, options) {
  const esbuild = await loadEsbuild();
  const { external, tsconfig, entryPoints } = options;
  const isCjs = format === 'cjs';
  const outfile = path.join(DIST_DIR, isCjs ? 'index.cjs' : 'index.mjs');

  ensureDir(path.dirname(outfile));
  console.log(`[build] ${format} -> ${outfile}`);

  await esbuild.build({
    entryPoints,
    outfile,
    bundle: true,
    sourcemap: true,
    format, // 'cjs' | 'esm'
    platform: isCjs ? 'node' : 'neutral',
    target: isCjs ? 'es2021' : 'esnext',
    external, // deps + peerDeps + node builtins (含 node:*)
    logLevel: 'info',
    ...(tsconfig ? { tsconfig } : {}),
  });
}

/* ------------------------- types via TypeScript API ------------------------- */
function buildTypesAPI(outDir = DIST_DIR) {
  let ts;
  try { ts = require('typescript'); }
  catch {
    console.error('[types] Missing dependency: typescript');
    process.exit(1);
  }

  const cfgPath = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');

  let fileNames, options;
  if (cfgPath) {
    // 读取 tsconfig.json
    const { config } = ts.readConfigFile(cfgPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(cfgPath));
    fileNames = parsed.fileNames;
    options = parsed.options;
  } else {
    // 没有 tsconfig 的降级：仅用 index.ts
    console.warn('[types] tsconfig.json not found; fallback to index.ts with basic options.');
    fileNames = ['index.ts'].filter((f) => fs.existsSync(f));
    options = {
      moduleResolution: 99, // NodeNext（避免引入 enum 名字，用常量值）
      target: 99,          // ESNext
      skipLibCheck: true,
      strict: true,
    };
  }

  // 强制仅输出声明
  options.declaration = true;
  options.emitDeclarationOnly = true;
  options.outDir = outDir;
  // 为了不受 sourceMap/emit 等其它设置影响
  options.noEmitOnError = false;

  console.log('[types] Generating .d.ts ...');
  const program = ts.createProgram(fileNames, options);
  const pre = ts.getPreEmitDiagnostics(program);
  const emitResult = program.emit();
  const diagnostics = pre.concat(emitResult.diagnostics);

  if (diagnostics.length) {
    const formatHost = {
      getCanonicalFileName: (p) => p,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    };
    const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost);
    console.error(message);
    if (emitResult.emitSkipped) {
      throw new Error('[types] Type generation failed.');
    }
  }
  console.log('[types] Declarations generated.');
}

/* ------------------------- main dispatcher ------------------------- */
(async function main() {
  const sub = (process.argv[2] || 'all').toLowerCase(); // all | cjs | esm | types | clean

  const pkg = readJSONSafe('package.json');
  const externalFromPkg = depsAsExternal(pkg);
  // 统一 external：依赖 + peer + Node 内置（含 node:*）
  const external = uniq([...externalFromPkg, ...nodeBuiltinsExternal()]);
  const tscPath = tsconfigPath();
  const entryPoints = entryPointsFromPkg(pkg);

  switch (sub) {
    case 'clean': {
      console.log('[clean] remove dist/');
      rimraf(DIST_DIR);
      break;
    }
    case 'cjs': {
      await buildOne('cjs', { external, tsconfig: tscPath, entryPoints });
      break;
    }
    case 'esm': {
      await buildOne('esm', { external, tsconfig: tscPath, entryPoints });
      break;
    }
    case 'types': {
      ensureDir(DIST_DIR);
      buildTypesAPI(DIST_DIR);
      break;
    }
    case 'all':
    default: {
      console.log('[clean] remove dist/');
      rimraf(DIST_DIR);
      await buildOne('cjs', { external, tsconfig: tscPath, entryPoints });
      await buildOne('esm', { external, tsconfig: tscPath, entryPoints });
      buildTypesAPI(DIST_DIR);
      console.log('[build] Done.');
      break;
    }
  }
})().catch((err) => {
  console.error('[build] Failed:', err);
  process.exit(1);
});

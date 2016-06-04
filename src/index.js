import {
  map, get, flow, set, filter, over, fromPairs, assignWith, union, includes, keys, reject, first,
  partial, cond, matchesProperty, constant, some, castArray, isEmpty, equals, sortBy, identity,
  mapValues, flatMap, groupBy, overSome, toPairs, update, reduce, concat,
} from 'lodash/fp';
import resolve from 'resolve';
import minimatch from 'minimatch';
import { relative, dirname, extname } from 'path';
import { readFile } from 'fs';
import promisify from 'tiny-promisify';
import os from 'os';

const isWindows = os.platform() === 'win32';

const readFilePromise = promisify(readFile);

export const defaultParser = 'espree';
export const defaultParserOptions = {
  ecmaVersion: 6,
  sourceType: 'module',
  ecmaFeatures: {
    jsx: true,
  },
};

const relativeToNodeModulesRe = /^[./\\]+\/node_modules[/\\]/;
const pointsToNodeModules = value => relativeToNodeModulesRe.test(value);

const getDeclarationFilename = get(['source', 'value']);

const getAstDeclarationImports = flow(
  get('body'),
  filter({ type: 'ImportDeclaration' })
);

const getImportDeclarationImportedNames = flow(
  get('specifiers'),
  map(cond([
    [matchesProperty('type', 'ImportDefaultSpecifier'), constant('default')],
    [matchesProperty('type', 'ImportNamespaceSpecifier'), constant('*')],
    [matchesProperty('type', 'ImportSpecifier'), get(['imported', 'name'])],
  ]))
);

const getAstImportsFromImportStatements = flow(
  getAstDeclarationImports,
  groupBy(getDeclarationFilename),
  mapValues(flatMap(getImportDeclarationImportedNames))
);

// Exports
const getVariableDeclarationExportedNames = cond([
  [matchesProperty('type', 'FunctionDeclaration'), get(['id', 'name'])],
  [matchesProperty('type', 'ClassDeclaration'), get(['id', 'name'])],
  [matchesProperty('type', 'VariableDeclaration'), flow(get('declarations'), flatMap('id.name'))],
]);

const exportNamedDeclarationExportedNames = flow(get('specifiers'), flatMap('exported.name'));
const exportNamedDeclarationImportNames = flow(get('specifiers'), flatMap('local.name'));

const getExportNamedDeclarationExportedNames = cond([
  [matchesProperty('declaration', null), exportNamedDeclarationExportedNames],
  [constant(true), flow(get('declaration'), getVariableDeclarationExportedNames)],
]);

const isExportDefaultDeclaration = matchesProperty('type', 'ExportDefaultDeclaration');
const isExportAllDeclaration = matchesProperty('type', 'ExportAllDeclaration');
const isExportNamedDeclaration = matchesProperty('type', 'ExportNamedDeclaration');

const getExportDeclarationExportedNames = cond([
  [isExportDefaultDeclaration, constant(['default'])],
  [isExportAllDeclaration, constant(['*'])],
  [isExportNamedDeclaration, getExportNamedDeclarationExportedNames],
]);

const getExportDeclarationImportedNames = cond([
  [isExportNamedDeclaration, exportNamedDeclarationImportNames],
  [isExportAllDeclaration, constant(['*'])],
]);

const getAstExportsDeclarations = flow(
  get('body'),
  filter(overSome([
    isExportDefaultDeclaration,
    isExportAllDeclaration,
    isExportNamedDeclaration,
  ]))
);

const getAstImportsFromExportStatements = flow(
  getAstExportsDeclarations,
  filter(getDeclarationFilename),
  groupBy(getDeclarationFilename),
  mapValues(flatMap(getExportDeclarationImportedNames))
);

const getAstLocalExports = flow(
  getAstExportsDeclarations,
  flatMap(getExportDeclarationExportedNames)
);

const getAstLocalImports = flow(
  over([
    getAstImportsFromImportStatements,
    getAstImportsFromExportStatements,
  ]),
  reduce(assignWith(union), {})
);


const resolveDeclrationFilenamePair = (basedir, resolveOptions, [dependency, value]) => (
  new Promise((res, rej) => {
    resolve(dependency, set('basedir', basedir, resolveOptions), (err, resolvedFilename) => (
      !err ? res([resolvedFilename, value]) : rej(err)
    ));
  })
);

const fileSuffixLen = '.m.css'.length;
export function matchWindows(file) {
  return file.indexOf('.m.css', file.length - fileSuffixLen) !== -1;
}

export default async function getDependencies({
  files = [],
  recurse = true,
  exclude = [],
  parser = defaultParser,
  parserOptions = defaultParserOptions,
  resolveOptions = {},
}) {
  const { parse } = require(parser); // eslint-disable-line

  const excludeValues = castArray(exclude);

  const fileIsExcluded = isEmpty(excludeValues)
    ? constant(false)
    : file => (!isWindows ? some(cond([
      [includes('*'), partial(minimatch, [file])],
      [constant(true), equals(file)],
    ]), excludeValues) : matchWindows(file));

  const addFile = async (state, filename) => {
    const { imports, exports, loadedFiles, stats } = state;

    const skip = includes(filename, loadedFiles) || fileIsExcluded(filename);
    if (skip) return { localImports: [], state };

    let contents;
    try {
      contents = String(await readFilePromise(filename, 'utf-8'));
    } catch (e) {
      if (e.code === 'ENOENT') {
        throw new Error(`Failed to read file ${filename}`);
      } else {
        throw e;
      }
    }

    const basedir = dirname(filename);

    let ast;
    try {
      ast = parse(contents, parserOptions);
    } catch (e) {
      if (extname(filename) === '.js') {
        throw e;
      }

      return update(['state', 'stats'], concat([`Failed to open file ${filename}`]), state);
    }

    const localExports = getAstLocalExports(ast);

    const allUnresolvedImportsPairsPromises = flow(
      getAstLocalImports,
      toPairs,
      map(partial(resolveDeclrationFilenamePair, [basedir, resolveOptions]))
    )(ast);

    const allImportsPairs = await Promise.all(allUnresolvedImportsPairsPromises);
    const allImports = fromPairs(allImportsPairs);

    const pairIsNodeModule = flow(
      first,
      partial(relative, [filename]),
      pointsToNodeModules
    );

    const localImports = flow(
      reject(pairIsNodeModule),
      fromPairs
    )(allImportsPairs);

    return {
      localImports: keys(localImports),
      state: {
        imports: assignWith(union, allImports, imports),
        exports: set([filename], localExports, exports),
        loadedFiles: union([filename], loadedFiles),
        stats,
      },
    };
  };

  let state = {
    imports: {},
    exports: {},
    loadedFiles: [],
    stats: [],
  };

  const getDependenciesFromFile = async (inputState, filename) => {
    let { localImports, state } = await addFile(inputState, filename); // eslint-disable-line

    if (!recurse) {
      return state;
    }

    for (const otherImport of localImports) {
      state = await getDependenciesFromFile(state, otherImport);
    }

    return state;
  };

  const filesValues = castArray(files);

  for (const filename of filesValues) {
    state = await getDependenciesFromFile(state, filename);
  }

  const sortValues = mapValues(sortBy(identity));
  state = flow(
    update('imports', sortValues),
    update('exports', sortValues)
  )(state);

  return state;
}

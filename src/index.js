import {
  map, get, flow, set, filter, over, fromPairs, assignWith, union, includes, keys, reject, first,
  partial, cond, matchesProperty, constant, some, castArray, isEmpty, equals, sortBy, identity,
  mapValues, flatMap, groupBy, overSome, toPairs, update, reduce, last, concat,
} from 'lodash/fp';
import resolve from 'resolve';
import minimatch from 'minimatch';
import { relative, dirname, extname } from 'path';
import { readFile } from 'fs';
import promisify from 'tiny-promisify';

const readFilePromise = promisify(readFile);

export const defaultParser = 'espree';
export const defaultParserOptions = {
  ecmaVersion: 6,
  sourceType: 'module',
  ecmaFeatures: {
    jsx: true,
  },
};

const nodeModulesRe = /^[./]+\/node_modules\//;
const isNodeModules = value => nodeModulesRe.test(value);

const astDeclarationImports = flow(
  get('body'),
  filter({ type: 'ImportDeclaration' })
);

const declarationImports = flow(
  get('specifiers'),
  map(cond([
    [matchesProperty('type', 'ImportDefaultSpecifier'), constant('default')],
    [matchesProperty('type', 'ImportNamespaceSpecifier'), constant('*')],
    [matchesProperty('type', 'ImportSpecifier'), get(['imported', 'name'])],
  ]))
);

const declarationVariableDeclarationExport = cond([
  [matchesProperty('type', 'FunctionDeclaration'), get(['id', 'name'])],
  [matchesProperty('type', 'VariableDeclaration'), flow(get('declarations'), flatMap('id.name'))],
]);

const declarationNamedExports = cond([
  [matchesProperty('declaration', null), flow(get('specifiers'), flatMap('exported.name'))],
  [constant(true), flow(get('declaration'), declarationVariableDeclarationExport)],
]);

const isDefaultDeclaration = matchesProperty('type', 'ExportDefaultDeclaration');
const isAllDeclaration = matchesProperty('type', 'ExportAllDeclaration');
const isNamedDeclaration = matchesProperty('type', 'ExportNamedDeclaration');

const getExportsExportedNames = flow(
  cond([
    [isDefaultDeclaration, constant('default')],
    [isAllDeclaration, constant('*')],
    [isNamedDeclaration, declarationNamedExports],
    [constant(true), constant(null)],
  ]),
  castArray
);

const getExportsImportedNames = cond([
  [isNamedDeclaration, flow(get('specifiers'), map('local.name'))],
  [isAllDeclaration, constant('*')],
]);

const astExports = flow(
  get('body'),
  filter(overSome([
    isDefaultDeclaration,
    isAllDeclaration,
    isNamedDeclaration,
  ]))
);

const declarationFilename = get(['source', 'value']);

const astImportsFromExportStatements = flow(
  astExports,
  filter(declarationFilename),
  groupBy(declarationFilename),
  mapValues(flatMap(getExportsImportedNames))
);

const astLocalExports = flow(
  astExports,
  flatMap(getExportsExportedNames)
);

const astImportsFromImportStatements = flow(
  astDeclarationImports,
  groupBy(declarationFilename),
  mapValues(flow(
    map(declarationImports),
    reduce(concat, [])
  ))
);

const astLocalImports = flow(
  over([
    astImportsFromImportStatements,
    astImportsFromExportStatements,
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
    : file => some(cond([
      [includes('*'), partial(minimatch, [file])],
      [constant(true), equals(file)],
    ]), excludeValues);

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

      const updatedStats = [...stats, `Failed to open file ${filename}`];

      return {
        localImports: [],
        stats: set('stats', updatedStats, state),
      };
    }

    const localExports = astLocalExports(ast);

    const allUnresolvedImportsPairsPromises = flow(
      astLocalImports,
      toPairs,
      map(partial(resolveDeclrationFilenamePair, [basedir, resolveOptions]))
    )(ast);

    const allImportsPairs = await Promise.all(allUnresolvedImportsPairsPromises);
    const allImports = fromPairs(allImportsPairs);

    const localImports = flow(
      reject(flow(
        first,
        partial(relative, [filename]),
        isNodeModules
      )),
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

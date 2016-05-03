import {
  map, get, flow, set, filter, over, fromPairs, assignWith, union, includes, keys, reject, first,
  partial, cond, matchesProperty, constant, some, castArray, isEmpty, equals, sortBy, identity,
  mapValues,
} from 'lodash/fp';
import resolve from 'resolve';
import minimatch from 'minimatch';
import { relative, dirname, basename } from 'path';
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

const declarationFilename = get(['source', 'value']);

const resolveDeclrationFilenameImportsPair = (basedir, resolveOptions, [dependency, imports]) => (
  new Promise((res, rej) => {
    resolve(dependency, set('basedir', basedir, resolveOptions), (err, resolvedFilename) => (
      !err ? res([resolvedFilename, imports]) : rej(err)
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
    const { dependencies, loadedFiles, stats } = state;

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
      if (basename(filename) === '.js') {
        throw e;
      }

      const updatedStats = [...stats, `Failed to open file ${filename}`];

      return {
        localImports: [],
        stats: set('stats', updatedStats, state),
      };
    }

    const declarationFilenameImportsPair = over([
      declarationFilename,
      declarationImports,
    ]);

    const astImports = astDeclarationImports(ast);

    const allImportsPromises = flow(
      map(declarationFilenameImportsPair),
      map(partial(resolveDeclrationFilenameImportsPair, [basedir, resolveOptions]))
    )(astImports);

    const allImportsPairs = await Promise.all(allImportsPromises);
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
        dependencies: assignWith(union, allImports, dependencies),
        loadedFiles: union(loadedFiles, [filename]),
        stats,
      },
    };
  };

  let state = {
    dependencies: {},
    loadedFiles: [],
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

  const dependencies = mapValues(sortBy(identity), state.dependencies);
  const { loadedFiles } = state;

  return { dependencies, loadedFiles };
}

import test from 'ava';
import { join } from 'path';
import getEsImports from '../src';

/* files demonstrate the following cases
import name from 'import';
import { name } from 'import';
import { name as otherName } from 'import';
import ... from './local-file'
import ... from 'node_module'
*/

const baseDir = join(__dirname, 'cases');
const singleFile = join(baseDir, 'single-file');
const localImports = join(baseDir, 'local-imports');
const namespaceImports = join(baseDir, 'namespace-imports');
const externalImports = join(baseDir, 'external-imports');
const nestedFiles = join(baseDir, 'nested-files');
const babelFile = join(baseDir, 'babel-file');
const nodeModules = join(__dirname, '../node_modules');

test('single-file parses and loads recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(singleFile, 'index.js')],
  }).then(({ dependencies }) => {
    t.deepEqual(dependencies, {});
  });
});

test('single-file parses and loads non-recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(singleFile, 'index.js')],
    recurse: false,
  }).then(({ dependencies }) => {
    t.deepEqual(dependencies, {});
  });
});

test('local-imports parses and loads recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(localImports, 'index.js')],
  }).then(({ dependencies }) => {
    t.deepEqual({
      [join(localImports, 'import1.js')]: ['default'],
      [join(localImports, 'import2.js')]: ['test'],
    }, dependencies);
  });
});

test('local-imports parses and loads non-recursively  via files (index)', t => {
  t.plan(1);

  return getEsImports({
    files: [join(localImports, 'index.js')],
    recurse: false,
  }).then(({ dependencies }) => {
    t.deepEqual({
      [join(localImports, 'import1.js')]: ['default'],
      [join(localImports, 'import2.js')]: ['test'],
    }, dependencies);
  });
});

test('local-imports parses and loads non-recursively via files (import1)', t => {
  t.plan(1);

  return getEsImports({
    files: [join(localImports, 'import1.js')],
    recurse: false,
  }).then(({ dependencies }) => {
    t.deepEqual({
      [join(localImports, 'import2.js')]: ['test'],
    }, dependencies);
  });
});

test('namespace-imports parses and loads recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(namespaceImports, 'index.js')],
  }).then(({ dependencies }) => {
    t.deepEqual({
      [join(namespaceImports, 'import1.js')]: ['*'],
    }, dependencies);
  });
});

test('external-imports parses and loads recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(externalImports, 'index.js')],
  }).then(({ dependencies }) => {
    t.deepEqual({
      [join(externalImports, 'import1.js')]: ['default'],
      [join(externalImports, 'import2.js')]: ['default'],
      [join(nodeModules, 'lodash/lodash.js')]: ['filter', 'map', 'reduce'],
    }, dependencies);
  });
});

test('nested-files parses and loads recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(nestedFiles, 'index.js')],
  }).then(({ dependencies }) => {
    t.deepEqual({
      [join(nestedFiles, 'import1/index.js')]: ['default'],
      [join(nestedFiles, 'import2/import2.js')]: ['test'],
      [join(nestedFiles, 'import3/import3.js')]: ['default'],
    }, dependencies);
  });
});

test('will not read files in the exclude string', t => {
  t.plan(1);

  return getEsImports({
    files: [join(nestedFiles, 'index.js')],
    exclude: join(nestedFiles, 'import1/**/*.js'),
  }).then(({ dependencies }) => {
    t.deepEqual({
      [join(nestedFiles, 'import1/index.js')]: ['default'],
      [join(nestedFiles, 'import2/import2.js')]: ['test'],
    }, dependencies);
  });
});

test('babel-file does not by default parse', t => {
  // If this fails, you need to change the case file
  t.plan(1);

  return getEsImports({
    files: [join(babelFile, 'index.js')],
  }).catch(() => {
    t.pass();
  });
});

test('babel-file parses and loads recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(babelFile, 'index.js')],
    parser: 'babel-eslint',
  }).then(() => {
    t.pass();
  });
});

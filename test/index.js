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
const duplicatedImports = join(baseDir, 'duplicated-imports');
const exportFrom = join(baseDir, 'export-from');
const exportFromNamespace = join(baseDir, 'export-from-namespace');
const nestedFiles = join(baseDir, 'nested-files');
const babelFile = join(baseDir, 'babel-file');
const nodeModules = join(__dirname, '../node_modules');

test('single-file parses and loads recirsively via a single entry point', t => {
  t.plan(2);

  const inputFile = join(singleFile, 'index.js');

  return getEsImports({
    files: [inputFile],
  }).then(({ imports, exports }) => {
    t.deepEqual(imports, {});
    t.deepEqual(exports, {
      [inputFile]: ['default', 'test'],
    });
  });
});

test('single-file parses and loads non-recirsively via a single entry point', t => {
  t.plan(2);

  const inputFile = join(singleFile, 'index.js');

  return getEsImports({
    files: [join(singleFile, 'index.js')],
    recurse: false,
  }).then(({ imports, exports }) => {
    t.deepEqual(imports, {});
    t.deepEqual(exports, {
      [inputFile]: ['default', 'test'],
    });
  });
});

test('local-imports parses and loads recirsively via a single entry point', t => {
  t.plan(2);

  return getEsImports({
    files: [join(localImports, 'index.js')],
  }).then(({ imports, exports }) => {
    t.deepEqual({
      [join(localImports, 'import1.js')]: ['default'],
      [join(localImports, 'import2.js')]: ['test'],
    }, imports);
    t.deepEqual({
      [join(localImports, 'index.js')]: [],
      [join(localImports, 'import1.js')]: ['default'],
      [join(localImports, 'import2.js')]: ['test'],
    }, exports);
  });
});

test('local-imports parses and loads non-recursively from index', t => {
  t.plan(2);

  return getEsImports({
    files: [join(localImports, 'index.js')],
    recurse: false,
  }).then(({ imports, exports }) => {
    t.deepEqual({
      [join(localImports, 'import1.js')]: ['default'],
      [join(localImports, 'import2.js')]: ['test'],
    }, imports);
    t.deepEqual({
      [join(localImports, 'index.js')]: [],
    }, exports);
  });
});

test('local-imports parses and loads non-recursively via files from import1', t => {
  t.plan(2);

  return getEsImports({
    files: [join(localImports, 'import1.js')],
    recurse: false,
  }).then(({ imports, exports }) => {
    t.deepEqual({
      [join(localImports, 'import2.js')]: ['test'],
    }, imports);
    t.deepEqual({
      [join(localImports, 'import1.js')]: ['default'],
    }, exports);
  });
});

test('it recognises namespace imports', t => {
  t.plan(1);

  return getEsImports({
    files: [join(namespaceImports, 'index.js')],
  }).then(({ imports }) => {
    t.deepEqual({
      [join(namespaceImports, 'import1.js')]: ['*'],
    }, imports);
  });
});

test('external-imports parses and loads recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(externalImports, 'index.js')],
  }).then(({ imports }) => {
    t.deepEqual({
      [join(externalImports, 'import1.js')]: ['default'],
      [join(externalImports, 'import2.js')]: ['default'],
      [join(nodeModules, 'lodash/lodash.js')]: ['filter', 'map', 'reduce'],
    }, imports);
  });
});

test('duplicated-imports parses and loads recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(duplicatedImports, 'index.js')],
  }).then(({ imports }) => {
    t.deepEqual({
      [join(nodeModules, 'lodash/lodash.js')]: ['filter', 'map'],
    }, imports);
  });
});

test('export from statements without a namespace work', t => {
  t.plan(2);

  return getEsImports({
    files: [join(exportFrom, 'index.js')],
  }).then(({ imports, exports }) => {
    t.deepEqual({
      [join(nodeModules, 'lodash/lodash.js')]: ['filter', 'map'],
    }, imports);
    t.deepEqual({
      [join(exportFrom, 'index.js')]: ['filt', 'map'],
    }, exports);
  });
});

test('export from statements with a namespace work', t => {
  t.plan(2);

  return getEsImports({
    files: [join(exportFromNamespace, 'index.js')],
  }).then(({ imports, exports }) => {
    t.deepEqual({
      [join(nodeModules, 'lodash/lodash.js')]: ['*'],
    }, imports);
    t.deepEqual({
      [join(exportFromNamespace, 'index.js')]: ['*'],
    }, exports);
  });
});

test('nested-files parses and loads recirsively via a single file', t => {
  t.plan(1);

  return getEsImports({
    files: [join(nestedFiles, 'index.js')],
  }).then(({ imports }) => {
    t.deepEqual({
      [join(nestedFiles, 'import1/index.js')]: ['default'],
      [join(nestedFiles, 'import2/import2.js')]: ['test'],
      [join(nestedFiles, 'import3/import3.js')]: ['default'],
    }, imports);
  });
});

test('will not read files in the exclude string', t => {
  t.plan(1);

  return getEsImports({
    files: [join(nestedFiles, 'index.js')],
    exclude: join(nestedFiles, 'import1/**/*.js'),
  }).then(({ imports }) => {
    t.deepEqual({
      [join(nestedFiles, 'import1/index.js')]: ['default'],
      [join(nestedFiles, 'import2/import2.js')]: ['test'],
    }, imports);
  });
});

test('babel-file does not by default parse', t => {
  // If this fails, you need to change the case file
  t.plan(1);

  return getEsImports({
    files: [join(babelFile, 'index.js')],
  }).then(state => console.log(state)).catch(() => {
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

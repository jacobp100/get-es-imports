# get-es-imports-exports

Recursively or non-recursively gets all ES6 imports and exports used within a project.

E.g.

```js
// a.js
import b from './b';
export b;
...
```

```js
// b.js
export * from './c';
...
```

```js
// c.js
import { find } from 'lodash';
export { find };
...
```

Returns an object in the form:

```js
{
  imports: {
    'full path of ./b': ['default'],
    'full path of ./c': ['*'],
    'full path of lodash': ['find'],
  },
  exports: {
    'full path of ./a': ['default'],
    'full path of ./b': ['*'],
    'full path of ./c': ['find'],
  }
}
```

# API

```js
import getEsImports from 'get-es-imports';

const { imports, exports, loadedFiles, stats } = await getEsImports({
  files = [],
  recurse = true,
  exclude = [],
  parser = defaultParser,
  parserOptions = defaultParserOptions,
  resolveOptions = {},
});
```

`files` is an array of paths for JS files you want to check.

The `recurse` option will recursively look at the files imported to find more imports. Will not recurse and look for dependencies within node_modules, but imports to these files are still recorded.

The `exclude` option is an array of file globs for files you don't want to check when recursing. As with node_modules, imports to these files are still reported.

The `parser` and `parserOptions` options are identical to [ESLint](http://eslint.org/docs/user-guide/configuring#specifying-parser). By default, it will supports ES6 modules and JSX.

The `resolveOptions` is passed to [resolve](https://github.com/substack/node-resolve) to resolvev imports.

## Return values

`imports` is a map of absolute file path to an array of imports. Named imports are left as-is, default imports are reported as `'default'`, and namespace imports are reported as `'*'`.

I.e.

```js
import { a } from './a'; // 'a'
import { a as b } from './a'; // 'a'
import a from './a'; // 'default'
import * as a from './a'; // '*'
```

Note that exports can also report as an import.

```js
export * from 'lodash'; // equates to import * from 'lodash'
```

`exports` is also a map of absolute filepath to an array, but this time, exports. As before, the same naming convention is used.

```js
export const five = 5; // 'five'
export { five as FIVE } // 'FIVE'
export default 5; // 'default'
export * from './a'; // '*'
```

`loadedFiles` is the files that were loaded and checked.

`stats` is an array of warnings. Currently the only warning is if a file failed to parse, and had an extension that wasn't .js (which would otherwise throw).

The default parser and default parser options are exported for your convenience.

# Tips

To use `babel-eslint`, use,

```js
getEsImports({
  ...
  parser: 'babel-eslint',
  ...
})
```

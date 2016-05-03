# get-es-imports

Recursively or non-recursively gets all ES6 imports used within a project.

E.g.

```js
// a.js
import b from './b';
...
```

```js
// b.js
import c from './c';
...
```

```js
// c.js
import { find } from 'lodash';
...
```

Returns an object in the form:

```js
{
  'full path of ./b': ['default'],
  'full path of ./c': ['default'],
  'full path of lodash': ['find'],
}
```

# API

```js
import getEsImports from 'get-es-imports';

const { dependencies, loadedFiles } = await getEsImports({
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

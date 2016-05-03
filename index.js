'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var lodash_fp = require('lodash/fp');
var resolve = _interopDefault(require('resolve'));
var minimatch = _interopDefault(require('minimatch'));
var path = require('path');
var fs = require('fs');
var promisify = _interopDefault(require('tiny-promisify'));

var babelHelpers = {};

babelHelpers.asyncToGenerator = function (fn) {
  return function () {
    var gen = fn.apply(this, arguments);
    return new Promise(function (resolve, reject) {
      function step(key, arg) {
        try {
          var info = gen[key](arg);
          var value = info.value;
        } catch (error) {
          reject(error);
          return;
        }

        if (info.done) {
          resolve(value);
        } else {
          return Promise.resolve(value).then(function (value) {
            return step("next", value);
          }, function (err) {
            return step("throw", err);
          });
        }
      }

      return step("next");
    });
  };
};

babelHelpers.slicedToArray = function () {
  function sliceIterator(arr, i) {
    var _arr = [];
    var _n = true;
    var _d = false;
    var _e = undefined;

    try {
      for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
        _arr.push(_s.value);

        if (i && _arr.length === i) break;
      }
    } catch (err) {
      _d = true;
      _e = err;
    } finally {
      try {
        if (!_n && _i["return"]) _i["return"]();
      } finally {
        if (_d) throw _e;
      }
    }

    return _arr;
  }

  return function (arr, i) {
    if (Array.isArray(arr)) {
      return arr;
    } else if (Symbol.iterator in Object(arr)) {
      return sliceIterator(arr, i);
    } else {
      throw new TypeError("Invalid attempt to destructure non-iterable instance");
    }
  };
}();

babelHelpers.toConsumableArray = function (arr) {
  if (Array.isArray(arr)) {
    for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i];

    return arr2;
  } else {
    return Array.from(arr);
  }
};

babelHelpers;

const readFilePromise = promisify(fs.readFile);

const defaultParser = 'espree';
const defaultParserOptions = {
  ecmaVersion: 6,
  sourceType: 'module',
  ecmaFeatures: {
    jsx: true
  }
};

const nodeModulesRe = /^[./]+\/node_modules\//;
const isNodeModules = value => nodeModulesRe.test(value);

const astDeclarationImports = lodash_fp.flow(lodash_fp.get('body'), lodash_fp.filter({ type: 'ImportDeclaration' }));

const declarationImports = lodash_fp.flow(lodash_fp.get('specifiers'), lodash_fp.map(lodash_fp.cond([[lodash_fp.matchesProperty('type', 'ImportDefaultSpecifier'), lodash_fp.constant('default')], [lodash_fp.matchesProperty('type', 'ImportNamespaceSpecifier'), lodash_fp.constant('*')], [lodash_fp.matchesProperty('type', 'ImportSpecifier'), lodash_fp.get(['imported', 'name'])]])));

const declarationFilename = lodash_fp.get(['source', 'value']);

const resolveDeclrationFilenameImportsPair = (basedir, resolveOptions, _ref) => {
  var _ref2 = babelHelpers.slicedToArray(_ref, 2);

  let dependency = _ref2[0];
  let imports = _ref2[1];
  return new Promise((res, rej) => {
    resolve(dependency, lodash_fp.set('basedir', basedir, resolveOptions), (err, resolvedFilename) => !err ? res([resolvedFilename, imports]) : rej(err));
  });
};

var index = (() => {
  var ref = babelHelpers.asyncToGenerator(function* (_ref3) {
    var _ref3$files = _ref3.files;
    let files = _ref3$files === undefined ? [] : _ref3$files;
    var _ref3$recurse = _ref3.recurse;
    let recurse = _ref3$recurse === undefined ? true : _ref3$recurse;
    var _ref3$exclude = _ref3.exclude;
    let exclude = _ref3$exclude === undefined ? [] : _ref3$exclude;
    var _ref3$parser = _ref3.parser;
    let parser = _ref3$parser === undefined ? defaultParser : _ref3$parser;
    var _ref3$parserOptions = _ref3.parserOptions;
    let parserOptions = _ref3$parserOptions === undefined ? defaultParserOptions : _ref3$parserOptions;
    var _ref3$resolveOptions = _ref3.resolveOptions;
    let resolveOptions = _ref3$resolveOptions === undefined ? {} : _ref3$resolveOptions;

    var _require = require(parser);

    const parse = _require.parse; // eslint-disable-line

    const excludeValues = lodash_fp.castArray(exclude);

    const fileIsExcluded = lodash_fp.isEmpty(excludeValues) ? lodash_fp.constant(false) : function (file) {
      return lodash_fp.some(lodash_fp.cond([[lodash_fp.includes('*'), lodash_fp.partial(minimatch, [file])], [lodash_fp.constant(true), lodash_fp.equals(file)]]), excludeValues);
    };

    const addFile = (() => {
      var ref = babelHelpers.asyncToGenerator(function* (state, filename) {
        const dependencies = state.dependencies;
        const loadedFiles = state.loadedFiles;
        const stats = state.stats;


        const skip = lodash_fp.includes(filename, loadedFiles) || fileIsExcluded(filename);
        if (skip) return { localImports: [], state: state };

        let contents;
        try {
          contents = String((yield readFilePromise(filename, 'utf-8')));
        } catch (e) {
          if (e.code === 'ENOENT') {
            throw new Error(`Failed to read file ${ filename }`);
          } else {
            throw e;
          }
        }

        const basedir = path.dirname(filename);

        let ast;
        try {
          ast = parse(contents, parserOptions);
        } catch (e) {
          if (path.basename(filename) === '.js') {
            throw e;
          }

          const updatedStats = [].concat(babelHelpers.toConsumableArray(stats), [`Failed to open file ${ filename }`]);

          return {
            localImports: [],
            stats: lodash_fp.set('stats', updatedStats, state)
          };
        }

        const declarationFilenameImportsPair = lodash_fp.over([declarationFilename, declarationImports]);

        const astImports = astDeclarationImports(ast);

        const allImportsPromises = lodash_fp.flow(lodash_fp.map(declarationFilenameImportsPair), lodash_fp.map(lodash_fp.partial(resolveDeclrationFilenameImportsPair, [basedir, resolveOptions])))(astImports);

        const allImportsPairs = yield Promise.all(allImportsPromises);
        const allImports = lodash_fp.fromPairs(allImportsPairs);

        const localImports = lodash_fp.flow(lodash_fp.reject(lodash_fp.flow(lodash_fp.first, lodash_fp.partial(path.relative, [filename]), isNodeModules)), lodash_fp.fromPairs)(allImportsPairs);

        return {
          localImports: lodash_fp.keys(localImports),
          state: {
            dependencies: lodash_fp.assignWith(lodash_fp.union, allImports, dependencies),
            loadedFiles: lodash_fp.union(loadedFiles, [filename]),
            stats: stats
          }
        };
      });
      return function addFile(_x2, _x3) {
        return ref.apply(this, arguments);
      };
    })();

    let state = {
      dependencies: {},
      loadedFiles: []
    };

    const getDependenciesFromFile = (() => {
      var ref = babelHelpers.asyncToGenerator(function* (inputState, filename) {
        var _ref4 = yield addFile(inputState, filename);

        let localImports = _ref4.localImports;
        let state = _ref4.state; // eslint-disable-line

        if (!recurse) {
          return state;
        }

        for (const otherImport of localImports) {
          state = yield getDependenciesFromFile(state, otherImport);
        }

        return state;
      });
      return function getDependenciesFromFile(_x4, _x5) {
        return ref.apply(this, arguments);
      };
    })();

    const filesValues = lodash_fp.castArray(files);

    for (const filename of filesValues) {
      state = yield getDependenciesFromFile(state, filename);
    }

    const dependencies = lodash_fp.mapValues(lodash_fp.sortBy(lodash_fp.identity), state.dependencies);
    var _state = state;
    const loadedFiles = _state.loadedFiles;


    return { dependencies: dependencies, loadedFiles: loadedFiles };
  });

  function getDependencies(_x) {
    return ref.apply(this, arguments);
  }

  return getDependencies;
})();

exports.defaultParser = defaultParser;
exports.defaultParserOptions = defaultParserOptions;
exports['default'] = index;
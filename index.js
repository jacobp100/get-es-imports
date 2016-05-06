'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.defaultParserOptions = exports.defaultParser = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _fp = require('lodash/fp');

var _resolve = require('resolve');

var _resolve2 = _interopRequireDefault(_resolve);

var _minimatch = require('minimatch');

var _minimatch2 = _interopRequireDefault(_minimatch);

var _path = require('path');

var _fs = require('fs');

var _tinyPromisify = require('tiny-promisify');

var _tinyPromisify2 = _interopRequireDefault(_tinyPromisify);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { return step("next", value); }, function (err) { return step("throw", err); }); } } return step("next"); }); }; }

const readFilePromise = (0, _tinyPromisify2.default)(_fs.readFile);

const defaultParser = exports.defaultParser = 'espree';
const defaultParserOptions = exports.defaultParserOptions = {
  ecmaVersion: 6,
  sourceType: 'module',
  ecmaFeatures: {
    jsx: true
  }
};

const nodeModulesRe = /^[./]+\/node_modules\//;
const isNodeModules = value => nodeModulesRe.test(value);

const astDeclarationImports = (0, _fp.flow)((0, _fp.get)('body'), (0, _fp.filter)({ type: 'ImportDeclaration' }));

const declarationImports = (0, _fp.flow)((0, _fp.get)('specifiers'), (0, _fp.map)((0, _fp.cond)([[(0, _fp.matchesProperty)('type', 'ImportDefaultSpecifier'), (0, _fp.constant)('default')], [(0, _fp.matchesProperty)('type', 'ImportNamespaceSpecifier'), (0, _fp.constant)('*')], [(0, _fp.matchesProperty)('type', 'ImportSpecifier'), (0, _fp.get)(['imported', 'name'])]])));

const declarationFilename = (0, _fp.get)(['source', 'value']);

const resolveDeclrationFilenameImportsPair = (basedir, resolveOptions, _ref) => {
  var _ref2 = _slicedToArray(_ref, 2);

  let dependency = _ref2[0];
  let imports = _ref2[1];
  return new Promise((res, rej) => {
    (0, _resolve2.default)(dependency, (0, _fp.set)('basedir', basedir, resolveOptions), (err, resolvedFilename) => !err ? res([resolvedFilename, imports]) : rej(err));
  });
};

exports.default = (() => {
  var ref = _asyncToGenerator(function* (_ref3) {
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

    const excludeValues = (0, _fp.castArray)(exclude);

    const fileIsExcluded = (0, _fp.isEmpty)(excludeValues) ? (0, _fp.constant)(false) : function (file) {
      return (0, _fp.some)((0, _fp.cond)([[(0, _fp.includes)('*'), (0, _fp.partial)(_minimatch2.default, [file])], [(0, _fp.constant)(true), (0, _fp.equals)(file)]]), excludeValues);
    };

    const addFile = (() => {
      var ref = _asyncToGenerator(function* (state, filename) {
        const dependencies = state.dependencies;
        const loadedFiles = state.loadedFiles;
        const stats = state.stats;


        const skip = (0, _fp.includes)(filename, loadedFiles) || fileIsExcluded(filename);
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

        const basedir = (0, _path.dirname)(filename);

        let ast;
        try {
          ast = parse(contents, parserOptions);
        } catch (e) {
          if ((0, _path.basename)(filename) === '.js') {
            throw e;
          }

          const updatedStats = [].concat(_toConsumableArray(stats), [`Failed to open file ${ filename }`]);

          return {
            localImports: [],
            stats: (0, _fp.set)('stats', updatedStats, state)
          };
        }

        const declarationFilenameImportsPair = (0, _fp.over)([declarationFilename, declarationImports]);

        const astImports = astDeclarationImports(ast);

        const allImportsPromises = (0, _fp.flow)((0, _fp.map)(declarationFilenameImportsPair), (0, _fp.map)((0, _fp.partial)(resolveDeclrationFilenameImportsPair, [basedir, resolveOptions])))(astImports);

        const allImportsPairs = yield Promise.all(allImportsPromises);
        const allImports = (0, _fp.fromPairs)(allImportsPairs);

        const localImports = (0, _fp.flow)((0, _fp.reject)((0, _fp.flow)(_fp.first, (0, _fp.partial)(_path.relative, [filename]), isNodeModules)), _fp.fromPairs)(allImportsPairs);

        return {
          localImports: (0, _fp.keys)(localImports),
          state: {
            dependencies: (0, _fp.assignWith)(_fp.union, allImports, dependencies),
            loadedFiles: (0, _fp.union)(loadedFiles, [filename]),
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
      var ref = _asyncToGenerator(function* (inputState, filename) {
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

    const filesValues = (0, _fp.castArray)(files);

    for (const filename of filesValues) {
      state = yield getDependenciesFromFile(state, filename);
    }

    const dependencies = (0, _fp.mapValues)((0, _fp.sortBy)(_fp.identity), state.dependencies);
    var _state = state;
    const loadedFiles = _state.loadedFiles;


    return { dependencies: dependencies, loadedFiles: loadedFiles };
  });

  function getDependencies(_x) {
    return ref.apply(this, arguments);
  }

  return getDependencies;
})();

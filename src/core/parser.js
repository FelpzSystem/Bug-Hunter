import { parse } from '@babel/parser';

const basePlugins = [
  'jsx',
  'typescript',
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'decorators-legacy',
  'dynamicImport',
  'importMeta',
  'topLevelAwait',
  'optionalChaining',
  'nullishCoalescingOperator',
  'logicalAssignment',
  'numericSeparator',
  'privateIn',
  'regexpUnicodeSets',
  'explicitResourceManagement',
  'importAttributes'
];

export function sourceLanguage(filename = 'unknown.js') {
  const lower = String(filename).toLowerCase();
  if (/\.(?:py|pyw|pyi)$/.test(lower)) return 'python';
  if (/\.(?:ts|tsx|mts|cts|d\.ts)$/.test(lower)) return 'typescript';
  if (/\.(?:js|jsx|mjs|cjs)$/.test(lower)) return 'javascript';
  return 'text';
}

export function parseSource(code, filename = 'unknown.js', options = {}) {
  const isTS = /\.(?:ts|tsx|mts|cts)$/.test(String(filename).toLowerCase());
  const sourceType = options.sourceType === 'module' || options.sourceType === 'script' ? options.sourceType : 'unambiguous';
  return parse(code, {
    sourceType,
    sourceFilename: filename,
    errorRecovery: false,
    ranges: true,
    tokens: false,
    plugins: isTS ? basePlugins : basePlugins.filter((p) => p !== 'typescript')
  });
}

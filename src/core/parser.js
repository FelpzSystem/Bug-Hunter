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
  'regexpUnicodeSets'
];

export function parseSource(code, filename = 'unknown.js') {
  const isTS = /\.(?:ts|tsx|mts|cts)$/.test(filename);
  return parse(code, {
    sourceType: 'unambiguous',
    sourceFilename: filename,
    errorRecovery: false,
    ranges: true,
    tokens: false,
    plugins: isTS ? basePlugins : basePlugins.filter((p) => p !== 'typescript')
  });
}

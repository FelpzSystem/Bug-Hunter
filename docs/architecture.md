# Architecture

## Credits

**Project author: Shark**

## Pipeline

`CLI → config → discovery → project-wide text read → parser → AST rules → project analysis → baseline → summary → reporter`

### 1. Discovery

The scanner recursively walks the requested project. `node_modules` is always excluded, together with VCS metadata directories (`.git`, `.hg`, `.svn`). Generated application directories are not silently excluded, because the default goal is to inspect the whole project tree.

Every regular file is classified as source, text, binary or oversized/unreadable. Supported source extensions are JavaScript/JSX/TypeScript/TSX variants. Other text files can still contribute project-level signals such as secret candidates and TODO/FIXME debt.

### 2. Parsing

Source is parsed into an AST with `@babel/parser`. The parser configuration enables modern JavaScript syntax, JSX and TypeScript syntax.

### 3. File rules

Each supported source file receives a context containing AST, source text, parent map, relative path, configurable globals, rule options and a `report()` helper.

### 4. Whole-project text signals

Text files that are not AST-supported are still read. The current cross-format signals include secret-like values and private-key material, with matched secret contents masked in findings.

### 5. Project rules

After file parsing, Bug Hunter aggregates import/require information and reads `package.json`. This enables project-level checks such as undeclared external imports and dependencies that appear unused.

### 6. Evidence

Each finding contains rule ID, category, severity, confidence, file, location, compact snippet, code frame, message and suggested action.

### 7. Reporting

The same result can be rendered as pretty terminal output, JSON, SARIF 2.1.0, Markdown or self-contained HTML.

## Design references

The project takes architectural inspiration from public static-analysis approaches in ESLint, Semgrep, SonarJS, CodeQL and Knip. It does not copy source files or rule implementations from those repositories.

## Current scope

Bug Hunter is a heuristic static analyzer. It does not prove exploitability, complete every dynamic dataflow path, runtime behavior or business-logic correctness.

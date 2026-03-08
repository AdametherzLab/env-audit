[![CI](https://github.com/AdametherzLab/env-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/AdametherzLab/env-audit/actions) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org/)

# env-audit 🔍

## ✨ Features

- ✅ **Zero Dependencies** — Uses only Node.js built-ins (`fs`, `path`, `crypto`)
- ✅ **Smart Type Inference** — Detects when `parseInt(env.PORT)` expects a number but gets `"true"`
- ✅ **CI-Ready** — Non-zero exit codes with `--ci` flag to block broken deploys
- ✅ **Multi-Env Support** — Check against `.env`, `.env.example`, and `.env.production` simultaneously
- ✅ **TypeScript Native** — Written in strict TypeScript with full type definitions

## 📦 Installation

```bash
npm install @adametherzlab/env-audit
# or
bun add @adametherzlab/env-audit
```

## 🚀 Quick Start

```bash
# Scan current directory against .env
npx env-audit --root ./src --env-files .env --env-files .env.example

# Or programmatically
// REMOVED external import: import { scanFiles, computeDiff, renderReport } from '@adametherzlab/env-audit';
import * as path from 'path';

const refs = scanFiles({
  rootDirectory: path.join(process.cwd(), 'src'),
  fileExtensions: ['.ts', '.tsx'],
  ignorePatterns: ['node_modules', '*.test.ts']
});

const result = computeDiff({ envFilePaths: ['.env'] }, refs);
console.log(result.missing); // Variables referenced but not declared
```

## 🖥️ CLI Usage

```bash
env-audit [options]

Options:
  --root <path>           Root directory to scan (default: cwd)
  --env-files <paths...>  Env files to check against (default: [".env"])
  --extensions <exts...>  File extensions to scan (default: [".ts", ".tsx", ".js", ".jsx"])
  --ignore <patterns...>  Glob patterns to exclude (default: ["node_modules", "dist"])
  --ci                    Exit with non-zero code if issues found (for CI pipelines)
  --verbose               Show detailed type mismatch information
  --help                  Show help

Examples:
  # Basic scan
  env-audit --root ./src --env-files .env --env-files .env.local

  # CI mode (fails build on issues)
  env-audit --ci --root ./src --env-files .env.example

  # Scan only TypeScript, ignore tests
  env-audit --extensions .ts --ignore "*.test.ts" --ignore "coverage"
```

## 🔍 The Three Audit Categories

### 1. Missing Variables
Variables referenced in code (`process.env.API_KEY`) but not found in any env file.

```typescript
// src/config.ts
const apiKey = process.env.API_KEY; // ❌ Missing in .env
```

### 2. Unused Variables
```bash
# .env
LEGACY_FEATURE_FLAG=true  # ❌ Not used anywhere in src/
```

### 3. Type Mismatches
```typescript
// src/server.ts
const port = parseInt(process.env.PORT); // Expects number
```
```bash
# .env
PORT=true  # ❌ Type mismatch: expected number, got boolean-like string
```

## 🧠 Supported Type Inference Patterns

| Pattern | Inferred Type | Example Value | Mismatch Detection |
|---------|--------------|---------------|-------------------|
| `parseInt(env.X)` | `number` | `"3000"` ✅ `"true"` ❌ | Non-numeric strings |
| `parseFloat(env.X)` | `number` | `"3.14"` ✅ `"abc"` ❌ | Non-numeric strings |
| `Boolean(env.X)` or `!!env.X` | `boolean` | `"true"`/`"false"` ✅ `"1"` ⚠️ | Non-boolean strings |
| `new URL(env.X)` | `url` | `"https://api.com"` ✅ `"not-a-url"` ❌ | Invalid URLs |
| `JSON.parse(env.X)` | `json` | `'{"a":1}'` ✅ `'undefined'` ❌ | Invalid JSON |

## 📚 API Reference

### `scanFiles(options: ScanOptions): EnvReference[]`

```typescript
// REMOVED external import: import { scanFiles } from '@adametherzlab/env-audit';
import * as path from 'path';

const references: EnvReference[] = scanFiles({
  rootDirectory: path.join(process.cwd(), 'src'),
  fileExtensions: ['.ts', '.tsx'],
  ignorePatterns: ['node_modules', '**/*.test.ts']
});
```

### `parseEnvFile(filePath: string): EnvMap`

Parses a `.env` file into a key-value map. Handles comments, quoted values, and multiline continuations.

```typescript
// REMOVED external import: import { parseEnvFile } from '@adametherzlab/env-audit';

const env: EnvMap = parseEnvFile('.env');
// { DATABASE_URL: "postgres://...", PORT: "3000" }
```

### `loadEnvFiles(filePaths: readonly string[]): EnvMap`

```typescript
// REMOVED external import: import { loadEnvFiles } from '@adametherzlab/env-audit';

const env: EnvMap = loadEnvFiles(['.env', '.env.local']);
```

### `computeDiff(options: DiffOptions, references: EnvReference[]): AuditResult`

```typescript
// REMOVED external import: import { computeDiff } from '@adametherzlab/env-audit';

const result: AuditResult = computeDiff(
  { envFilePaths: ['.env', '.env.example'] },
  references
);

// result.missing: EnvReference[] - referenced but not declared
// result.unused: string[] - declared but not referenced  
// result.typeMismatches: TypeMismatch[] - type conflicts
```

### `renderReport(result: AuditResult, options: CliOptions): void`

Renders a color-coded report to stdout.

```typescript
// REMOVED external import: import { renderReport, parseCliArgs } from '@adametherzlab/env-audit';

const options = parseCliArgs(process.argv);
renderReport(auditResult, options);
```

### `runCli(): Promise<void>`

```typescript
// REMOVED external import: import { runCli } from '@adametherzlab/env-audit';

await runCli(); // Parses args, scans, diffs, renders, exits
```

## 🔧 CI Integration

### GitHub Actions

```yaml
name: Env Audit
on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g @adametherzlab/env-audit
      - run: env-audit --ci --root ./src --env-files .env.example
```

### Generic Pipeline

```bash
# Add to your build script
env-audit --ci --root $PROJECT_ROOT --env-files .env.production || exit 1
```

The `--ci` flag ensures the process exits with code `1` if any missing, unused, or mismatched variables are found, preventing broken deployments.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 License

MIT © [AdametherzLab](https://github.com/AdametherzLab)
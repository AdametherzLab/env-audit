/**
 * Public API entry point for env-audit.
 * 
 * Static scanner that finds missing, unused, and type-mismatched environment
 * variables across TypeScript/JavaScript codebases. Cross-references
 * `process.env` usage against `.env` files to surface configuration drift.
 * 
 * @example
 * ```typescript
 * import { scanFiles, parseEnvFile, computeDiff, runCli } from 'env-audit';
 * 
 * // Programmatic usage
 * const refs = scanFiles({ rootDirectory: './src', fileExtensions: ['.ts'] });
 * const env = parseEnvFile('.env');
 * const audit = computeDiff(refs, { envFilePaths: ['.env'] });
 * 
 * // Or run the CLI
 * await runCli();
 * ```
 */

// Core types
export type {
  AuditResult,
  DiffOptions,
  EnvMap,
  EnvReference,
  InferredType,
  ScanOptions,
  TypeMismatch,
} from './types.js';

// CLI-specific types
export type { CliOptions } from './cli.js';

// Source code scanning
export { scanFiles } from './scan.js';

// Environment file parsing and diffing
export { computeDiff, loadEnvFiles, parseEnvFile } from './diff.js';

// CLI interface
export { parseCliArgs, renderReport, runCli } from './cli.js';
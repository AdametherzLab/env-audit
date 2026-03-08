/**
 * Represents the inferred type context of an environment variable usage
 * based on how it is consumed in the source code.
 */
export type InferredType = 'string' | 'number' | 'boolean' | 'json' | 'unknown';

/**
 * A single reference to `process.env.X` discovered in the codebase.
 */
export interface EnvReference {
  /** Absolute filesystem path to the file containing the reference. */
  readonly filePath: string;
  /** 1-indexed line number where the reference occurs. */
  readonly lineNumber: number;
  /** The environment variable name (e.g., "DATABASE_URL"). */
  readonly variableName: string;
  /** The type inferred from usage context (e.g., parseInt implies 'number'). */
  readonly inferredType: InferredType;
}

/**
 * Parsed key-value pairs from a .env file.
 * Keys are variable names; values are the raw, uninterpreted strings.
 */
export type EnvMap = Readonly<Record<string, string>>;

/**
 * A discrepancy between the value declared in an env file and the type
 * inferred from its usage in code.
 */
export interface TypeMismatch {
  /** The environment variable name. */
  readonly variableName: string;
  /** The raw value string found in the .env file. */
  readonly declaredValue: string;
  /** The type expected by the codebase (never 'unknown' if we detected a mismatch). */
  readonly expectedType: Exclude<InferredType, 'unknown'>;
}

/**
 * The complete output of an audit operation, cataloging all discrepancies
 * between code references and env file declarations.
 */
export interface AuditResult {
  /** Variables referenced in code but absent from all provided env files. */
  readonly missing: readonly string[];
  /** Variables declared in env files but never referenced in code. */
  readonly unused: readonly string[];
  /** Variables whose declared values conflict with their inferred usage types. */
  readonly typeMismatches: readonly TypeMismatch[];
}

/**
 * Configuration for the source file scanner.
 */
export interface ScanOptions {
  /** Root directory to begin recursive traversal. */
  readonly rootDirectory: string;
  /** File extensions to include (e.g., [".ts", ".tsx", ".js"]). */
  readonly fileExtensions: readonly string[];
  /** Glob patterns for paths to exclude (e.g., ["node_modules", "*.test.ts"]). */
  readonly ignorePatterns: readonly string[];
}

/**
 * Configuration for the diff operation comparing code references against
 * env file declarations.
 */
export interface DiffOptions {
  /** Ordered list of .env file paths to load and compare against code. */
  readonly envFilePaths: readonly string[];
}
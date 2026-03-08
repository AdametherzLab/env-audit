#!/usr/bin/env node

import * as path from "path";
import { fileURLToPath } from "url";
import type { AuditResult, ScanOptions, DiffOptions, EnvReference } from "./types";
import { scanSourceFiles } from "./scanner";
import { computeDiff } from "./diff";

const ANSI = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
} as const;

/**
 * Configuration options derived from command line arguments.
 */
export interface CliOptions {
  readonly root: string;
  readonly envFiles: readonly string[];
  readonly extensions: readonly string[];
  readonly ignorePatterns: readonly string[];
  readonly ci: boolean;
  readonly verbose: boolean;
}

/**
 * Parse process.argv into structured CLI options.
 * @param argv - The raw argument array (typically process.argv)
 * @returns Parsed options with defaults applied
 * @throws {Error} If required flag values are missing or unknown flags are provided
 * @example
 * const options = parseCliArgs(process.argv);
 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  const args = argv.slice(2);
  
  const parsed: {
    root: string;
    envFiles: string[];
    extensions: string[];
    ignorePatterns: string[];
    ci: boolean;
    verbose: boolean;
  } = {
    root: ".",
    envFiles: [],
    extensions: [],
    ignorePatterns: [],
    ci: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case "--root": {
        if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
          throw new Error("--root requires a directory path");
        }
        parsed.root = args[++i];
        break;
      }
      case "--env": {
        if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
          throw new Error("--env requires a file path");
        }
        parsed.envFiles.push(args[++i]);
        break;
      }
      case "--ext": {
        if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
          throw new Error("--ext requires a file extension");
        }
        parsed.extensions.push(args[++i]);
        break;
      }
      case "--ignore": {
        if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
          throw new Error("--ignore requires a pattern");
        }
        parsed.ignorePatterns.push(args[++i]);
        break;
      }
      case "--ci":
        parsed.ci = true;
        break;
      case "--verbose":
        parsed.verbose = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }

  if (parsed.envFiles.length === 0) {
    parsed.envFiles = [".env", ".env.example", ".env.production"];
  }
  
  if (parsed.extensions.length === 0) {
    parsed.extensions = ["ts", "js", "tsx", "jsx"];
  }

  return {
    root: path.resolve(parsed.root),
    envFiles: parsed.envFiles.map(f => path.resolve(parsed.root, f)),
    extensions: parsed.extensions.map(ext => ext.startsWith(".") ? ext : `.${ext}`),
    ignorePatterns: parsed.ignorePatterns,
    ci: parsed.ci,
    verbose: parsed.verbose,
  } satisfies CliOptions;
}

/**
 * Render a color-coded audit report to stdout.
 * @param result - The audit results containing discrepancies
 * @param options - CLI options controlling output behavior
 * @returns void
 * @example
 * renderReport(auditResult, { verbose: true, ci: false, root: "/project", envFiles: [], extensions: [], ignorePatterns: [] });
 */
export function renderReport(result: AuditResult, options: CliOptions): void {
  const { missing, unused, typeMismatches } = result;
  const hasIssues = missing.length > 0 || unused.length > 0 || typeMismatches.length > 0;
  
  if (!hasIssues) {
    console.log(`${ANSI.green}✓ Environment audit passed${ANSI.reset}`);
    console.log(`${ANSI.green}  No issues detected${ANSI.reset}`);
    return;
  }

  console.log(`${ANSI.bold}Environment Audit Report${ANSI.reset}\n`);

  if (missing.length > 0) {
    console.log(`${ANSI.red}Missing Variables (${missing.length})${ANSI.reset}`);
    console.log(`${ANSI.red}Referenced in code but not declared in env files:${ANSI.reset}`);
    missing.forEach(variable => {
      console.log(`  ${ANSI.red}• ${variable}${ANSI.reset}`);
    });
    console.log();
  }

  if (typeMismatches.length > 0) {
    console.log(`${ANSI.yellow}Type Mismatches (${typeMismatches.length})${ANSI.reset}`);
    console.log(`${ANSI.yellow}Declared values incompatible with usage:${ANSI.reset}`);
    typeMismatches.forEach(mismatch => {
      console.log(`  ${ANSI.yellow}• ${mismatch.variableName}${ANSI.reset}`);
      console.log(`    Value: "${mismatch.declaredValue}"`);
      console.log(`    Expected type: ${mismatch.expectedType}`);
    });
    console.log();
  }

  if (unused.length > 0) {
    console.log(`${ANSI.cyan}Unused Variables (${unused.length})${ANSI.reset}`);
    console.log(`${ANSI.cyan}Declared but never referenced:${ANSI.reset}`);
    unused.forEach(variable => {
      console.log(`  ${ANSI.cyan}• ${variable}${ANSI.reset}`);
    });
    console.log();
  }

  if (options.verbose) {
    console.log(`Root directory: ${options.root}`);
    console.log(`Env files: ${options.envFiles.join(", ")}`);
  }
}

/**
 * Execute the complete CLI pipeline: parse arguments, scan source files,
 * compute differences, render report, and exit with appropriate code.
 * @returns Promise that resolves when execution completes
 * @throws {Error} If file system operations fail or arguments are invalid
 * @example
 * await runCli();
 */
export async function runCli(): Promise<void> {
  try {
    const options = parseCliArgs(process.argv);
    
    if (options.verbose) {
      console.log(`Scanning: ${options.root}`);
    }

    const scanOptions: ScanOptions = {
      rootDirectory: options.root,
      fileExtensions: options.extensions,
      ignorePatterns: options.ignorePatterns,
    };

    const references: readonly EnvReference[] = await scanSourceFiles(scanOptions);
    
    if (options.verbose) {
      console.log(`Found ${references.length} environment references`);
    }

    const diffOptions: DiffOptions = {
      envFilePaths: options.envFiles,
    };

    const result = computeDiff(references, diffOptions);
    
    renderReport(result, options);

    const hasIssues = result.missing.length > 0 || 
                     result.unused.length > 0 || 
                     result.typeMismatches.length > 0;

    if (hasIssues && options.ci) {
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${ANSI.red}Error: ${message}${ANSI.reset}`);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  runCli();
}
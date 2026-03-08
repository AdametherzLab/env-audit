import * as fs from "fs";
import * as path from "path";
import type { EnvReference, InferredType, ScanOptions } from "./types.js";

/**
 * Determine if a path should be excluded from scanning.
 * Automatically excludes node_modules directories.
 */
function shouldExclude(filePath: string, patterns: readonly string[]): boolean {
  if (filePath.includes("node_modules")) {
    return true;
  }

  const basename = path.basename(filePath);
  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      if (regex.test(basename) || regex.test(filePath)) {
        return true;
      }
    } else if (basename === pattern || filePath.includes(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Infer the type of an environment variable from its usage context.
 * Examines surrounding code for type casts and comparisons.
 */
function inferTypeFromContext(line: string, matchStart: number): InferredType {
  const lookBehind = line.slice(Math.max(0, matchStart - 40), matchStart);
  const lookAhead = line.slice(matchStart, Math.min(line.length, matchStart + 40));

  // Number: parseInt(process.env.X) or parseFloat(process.env.X)
  if (/\b(parseInt|parseFloat)\s*\(\s*$/.test(lookBehind)) {
    return "number";
  }

  // Boolean: Boolean(process.env.X)
  if (/\bBoolean\s*\(\s*$/.test(lookBehind)) {
    return "boolean";
  }

  // Boolean: process.env.X === true/false or == true/false
  if (/\b===?\s*(true|false)\b/.test(lookAhead) || /\b(true|false)\s*===?\b/.test(lookBehind)) {
    return "boolean";
  }

  // JSON: JSON.parse(process.env.X)
  if (/\bJSON\.parse\s*\(\s*$/.test(lookBehind)) {
    return "json";
  }

  // URL: new URL(process.env.X) - treated as string per type constraints
  if (/\bnew\s+URL\s*\(\s*$/.test(lookBehind)) {
    return "string";
  }

  return "string";
}

/**
 * Extract environment variable references from a single file.
 */
function extractReferencesFromFile(filePath: string): EnvReference[] {
  const references: EnvReference[] = [];
  let content: string;

  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const lines = content.split(/\r?\n/);
  // Matches process.env.VAR_NAME or process.env['VAR_NAME'] or process.env["VAR_NAME"]
  const regex = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)|process\.env\[(['"])([A-Za-z_][A-Za-z0-9_]*)\2\]/g;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let match: RegExpExecArray | null;

    regex.lastIndex = 0;
    while ((match = regex.exec(line)) !== null) {
      const varName = match[1] || match[3];
      if (!varName) continue;

      const inferredType = inferTypeFromContext(line, match.index);

      references.push({
        filePath,
        lineNumber: lineIndex + 1,
        variableName: varName,
        inferredType,
      });
    }
  }

  return references;
}

/**
 * Recursively traverse directory tree to collect references.
 */
function traverseDirectory(
  currentPath: string,
  options: ScanOptions,
  accumulator: EnvReference[]
): void {
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(currentPath, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Failed to read directory ${currentPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);

    if (shouldExclude(fullPath, options.ignorePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      traverseDirectory(fullPath, options, accumulator);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (options.fileExtensions.includes(ext)) {
        const refs = extractReferencesFromFile(fullPath);
        accumulator.push(...refs);
      }
    }
  }
}

/**
 * Scan source files recursively for process.env references.
 * @param options - Configuration specifying root directory, extensions, and ignore patterns
 * @returns Deduplicated array of environment variable references
 * @throws {Error} If root directory does not exist or is inaccessible
 * @example
 * const refs = scanFiles({
 *   rootDirectory: path.join(process.cwd(), "src"),
 *   fileExtensions: [".ts", ".tsx"],
 *   ignorePatterns: ["*.test.ts", "dist"]
 * });
 */
export function scanFiles(options: ScanOptions): EnvReference[] {
  if (!fs.existsSync(options.rootDirectory)) {
    throw new Error(`Scan root does not exist: ${options.rootDirectory}`);
  }

  const stat = fs.statSync(options.rootDirectory);
  if (!stat.isDirectory()) {
    throw new Error(`Scan root is not a directory: ${options.rootDirectory}`);
  }

  const allReferences: EnvReference[] = [];
  traverseDirectory(options.rootDirectory, options, allReferences);

  // Deduplicate by variableName + filePath + lineNumber
  const seen = new Set<string>();
  const unique: EnvReference[] = [];

  for (const ref of allReferences) {
    const key = `${ref.variableName}:${ref.filePath}:${ref.lineNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(ref);
    }
  }

  return unique;
}
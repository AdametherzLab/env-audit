import * as fs from 'fs';
import * as path from 'path';
import type { EnvMap, EnvReference, DiffOptions, AuditResult, TypeMismatch, InferredType } from './types.js';

/**
 * Parse a .env file into a key-value map.
 * Handles comments (# prefix), blank lines, quoted values (single/double),
 * inline comments, and multiline values using backslash continuation.
 * @param filePath - Absolute or relative path to the .env file
 * @returns Map of environment variable names to their string values
 * @throws {Error} If the file cannot be read or does not exist
 * @example
 * const env = parseEnvFile(".env");
 * // env = { DATABASE_URL: "postgres://...", PORT: "3000" }
 */
export function parseEnvFile(filePath: string): EnvMap {
  const resolvedPath = path.resolve(filePath);
  
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Environment file not found: ${resolvedPath}`);
  }
  
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const env: Record<string, string> = {};
  
  // Process line continuations to build logical lines
  const physicalLines = content.split(/\r?\n/);
  const logicalLines: string[] = [];
  let buffer = '';
  
  for (const line of physicalLines) {
    if (line.endsWith('\\')) {
      buffer += line.slice(0, -1);
    } else {
      buffer += line;
      logicalLines.push(buffer);
      buffer = '';
    }
  }
  if (buffer) logicalLines.push(buffer);
  
  for (const line of logicalLines) {
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const separatorIdx = trimmed.indexOf('=');
    if (separatorIdx === -1) continue;
    
    const key = trimmed.slice(0, separatorIdx).trim();
    let value = trimmed.slice(separatorIdx + 1);
    
    if (!key) continue;
    
    // Handle quoted values
    const firstChar = value[0];
    if (firstChar === '"' || firstChar === "'") {
      let endIdx = -1;
      for (let i = 1; i < value.length; i++) {
        if (value[i] === '\\') {
          i++; // Skip escaped character
        } else if (value[i] === firstChar) {
          endIdx = i;
          break;
        }
      }
      
      if (endIdx !== -1) {
        let quoted = value.slice(1, endIdx);
        // Unescape common sequences for double quotes
        if (firstChar === '"') {
          quoted = quoted
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\r/g, '\r')
            .replace(/\\\\/g, '\\');
        }
        value = quoted;
      } else {
        // Unclosed quote - treat as unquoted and trim
        value = value.trim();
      }
    } else {
      // Unquoted: trim and strip inline comments
      value = value.trim();
      const commentIdx = value.search(/\s+#/);
      if (commentIdx !== -1) {
        value = value.slice(0, commentIdx).trim();
      }
    }
    
    env[key] = value;
  }
  
  return env;
}

/**
 * Load and merge multiple .env files into a single map.
 * Later files in the array take precedence over earlier ones.
 * @param filePaths - Array of paths to .env files
 * @returns Merged environment variable map
 * @throws {Error} If any file cannot be read
 * @example
 * const env = loadEnvFiles([".env", ".env.local"]);
 */
export function loadEnvFiles(filePaths: readonly string[]): EnvMap {
  const merged: Record<string, string> = {};
  
  for (const filePath of filePaths) {
    const env = parseEnvFile(filePath);
    Object.assign(merged, env);
  }
  
  return merged;
}

/**
 * Check if a value conforms to the expected type.
 * @param value - The environment variable value
 * @param expectedType - The type to validate against
 * @returns True if valid for the type
 */
function isValidType(value: string, expectedType: Exclude<InferredType, 'unknown'>): boolean {
  const trimmed = value.trim();
  
  switch (expectedType) {
    case 'number':
      return trimmed !== '' && !isNaN(Number(trimmed));
    case 'boolean':
      return /^(true|false|1|0|yes|no)$/i.test(trimmed);
    case 'json':
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    case 'string':
      return true;
    default:
      return true;
  }
}

/**
 * Compute the difference between declared environment variables and code references.
 * Identifies missing variables (referenced but not declared), unused variables
 * (declared but not referenced), and type mismatches.
 * @param options - Configuration including paths to env files
 * @param references - Environment variable references found in source code
 * @returns Audit result categorizing all discrepancies
 * @example
 * const result = computeDiff(
 *   { envFilePaths: [".env"] },
 *   [{ variableName: "PORT", inferredType: "number", filePath: "/src/app.ts", lineNumber: 5 }]
 * );
 */
export function computeDiff(
  options: DiffOptions,
  references: readonly EnvReference[]
): AuditResult {
  if (options.envFilePaths.length === 0) {
    throw new Error('At least one env file path must be provided');
  }
  
  const declaredEnv = loadEnvFiles(options.envFilePaths);
  const declaredKeys = new Set(Object.keys(declaredEnv));
  const referencedKeys = new Set(references.map(r => r.variableName));
  
  // Build map of variable -> inferred types
  const typeMap = new Map<string, Set<InferredType>>();
  for (const ref of references) {
    if (!typeMap.has(ref.variableName)) {
      typeMap.set(ref.variableName, new Set());
    }
    typeMap.get(ref.variableName)!.add(ref.inferredType);
  }
  
  // Missing: referenced but not declared
  const missing = Array.from(referencedKeys).filter(k => !declaredKeys.has(k));
  
  // Unused: declared but not referenced
  const unused = Array.from(declaredKeys).filter(k => !referencedKeys.has(k));
  
  // Type mismatches: declared but fails validation for any inferred specific type
  const typeMismatches: TypeMismatch[] = [];
  
  for (const [varName, types] of typeMap) {
    if (!declaredKeys.has(varName)) continue;
    
    const declaredValue = declaredEnv[varName];
    const specificTypes = Array.from(types).filter((t): t is Exclude<InferredType, 'unknown'> => t !== 'unknown');
    
    // Report first failing type check
    for (const expectedType of specificTypes) {
      if (!isValidType(declaredValue, expectedType)) {
        typeMismatches.push({ variableName: varName, declaredValue, expectedType });
        break;
      }
    }
  }
  
  return { missing, unused, typeMismatches };
}
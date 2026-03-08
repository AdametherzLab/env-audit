import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { scanFiles, parseEnvFile, computeDiff, parseCliArgs, loadEnvFiles } from "../src/index.ts";

describe("env-audit public API", () => {
  it("scanFiles extracts process.env references with line numbers and inferred types", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-audit-scan-"));
    try {
      const testFile = path.join(tmpDir, "config.ts");
      fs.writeFileSync(testFile, "const port = parseInt(process.env.PORT);\nconst host = process.env.HOST;\nconst debug = Boolean(process.env.DEBUG);");
      
      const result = scanFiles({
        rootDirectory: tmpDir,
        fileExtensions: [".ts"],
        ignorePatterns: []
      });
      
      expect(result.length).toBe(3);
      
      const portRef = result.find(r => r.variableName === "PORT");
      expect(portRef).toBeDefined();
      expect(portRef!.inferredType).toBe("number");
      expect(portRef!.lineNumber).toBe(1);
      
      const hostRef = result.find(r => r.variableName === "HOST");
      expect(hostRef!.inferredType).toBe("string");
      expect(hostRef!.lineNumber).toBe(2);
      
      const debugRef = result.find(r => r.variableName === "DEBUG");
      expect(debugRef!.inferredType).toBe("boolean");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("parseEnvFile handles comments, blank lines, quoted values, and equals signs", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-audit-parse-"));
    try {
      const envFile = path.join(tmpDir, ".env");
      fs.writeFileSync(envFile, "# Database\nDATABASE_URL=postgres://localhost\n\n# API key with equals\nAPI_KEY=abc=def==\nQUOTED=\"quoted=value\"\nEMPTY=\n");
      
      const result = parseEnvFile(envFile);
      
      expect(result.DATABASE_URL).toBe("postgres://localhost");
      expect(result.API_KEY).toBe("abc=def==");
      expect(result.QUOTED).toBe("quoted=value");
      expect(result.EMPTY).toBe("");
      expect(result.COMMENT).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("computeDiff identifies missing variables not declared in env files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-audit-diff-"));
    try {
      const envFile = path.join(tmpDir, ".env");
      fs.writeFileSync(envFile, "PRESENT=value\n");
      
      const references: EnvReference[] = [
        { variableName: "PRESENT", inferredType: "string", filePath: "/test.ts", lineNumber: 1 },
        { variableName: "MISSING", inferredType: "string", filePath: "/test.ts", lineNumber: 2 }
      ];
      
      const result = computeDiff({ envFilePaths: [envFile] }, references);
      
      expect(result.missing).toContain("MISSING");
      expect(result.missing).not.toContain("PRESENT");
      expect(result.unused).toEqual([]);
      expect(result.typeMismatches).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("computeDiff detects type mismatches for numeric inference against non-numeric values", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-audit-mismatch-"));
    try {
      const envFile = path.join(tmpDir, ".env");
      fs.writeFileSync(envFile, "PORT=true\nCOUNT=42\n");
      
      const references: EnvReference[] = [
        { variableName: "PORT", inferredType: "number", filePath: "/test.ts", lineNumber: 1 },
        { variableName: "COUNT", inferredType: "number", filePath: "/test.ts", lineNumber: 2 }
      ];
      
      const result = computeDiff({ envFilePaths: [envFile] }, references);
      
      expect(result.typeMismatches.length).toBe(1);
      expect(result.typeMismatches[0].variableName).toBe("PORT");
      expect(result.typeMismatches[0].declaredValue).toBe("true");
      expect(result.typeMismatches[0].expectedType).toBe("number");
      expect(result.missing).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("parseCliArgs extracts root, env files, ci, and verbose flags", () => {
    const argv = ["node", "script.js", "--root", "./src", "--env", ".env.local", "--ci", "--verbose"];
    
    const result = parseCliArgs(argv);
    
    expect(path.isAbsolute(result.root)).toBe(true);
    expect(result.envFiles).toEqual([".env", ".env.local", ".env.development"].map(p => path.resolve(p)));
    expect(result.ci).toBe(true);
    expect(result.verbose).toBe(true);
    expect(result.extensions).toEqual([".ts", ".js", ".tsx", ".jsx"]);
  });

  it("computes diffs across multiple env files with precedence", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-audit-merge-"));
    try {
      const envBase = path.join(tmpDir, ".env");
      const envLocal = path.join(tmpDir, ".env.local");
      fs.writeFileSync(envBase, "OVERLAP=base\nBASE_ONLY=1\n");
      fs.writeFileSync(envLocal, "OVERLAP=local\nLOCAL_ONLY=2\n");
      
      const references: EnvReference[] = [
        { variableName: "OVERLAP", inferredType: "string", filePath: "/test.ts", lineNumber: 1 },
        { variableName: "BASE_ONLY", inferredType: "number", filePath: "/test.ts", lineNumber: 2 },
        { variableName: "LOCAL_ONLY", inferredType: "number", filePath: "/test.ts", lineNumber: 3 }
      ];
      
      const result = computeDiff({ envFilePaths: [envBase, envLocal] }, references);
      
      expect(result.missing).toEqual([]);
      expect(result.unused).toEqual([]);
      expect(result.typeMismatches).toEqual([]);
      expect(loadEnvFiles([envBase, envLocal])).toEqual({
        OVERLAP: "local",
        BASE_ONLY: "1",
        LOCAL_ONLY: "2"
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

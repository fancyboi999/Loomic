import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const mode = process.argv[2] ?? "typecheck";
const cwd = process.cwd();

const formatHost = {
  getCurrentDirectory: () => cwd,
  getCanonicalFileName: (fileName) => fileName,
  getNewLine: () => ts.sys.newLine,
};

const manifest = JSON.parse(
  await readFile(path.join(cwd, "package.json"), "utf8"),
);

if (
  !manifest.private ||
  manifest.type !== "module" ||
  typeof manifest.name !== "string" ||
  !manifest.name.startsWith("@loomic/")
) {
  throw new Error(
    "Task 1 app manifests must stay private, ESM, and scoped under @loomic/.",
  );
}

const configResult = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (configResult.error) {
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext([configResult.error], formatHost),
  );
}

const parsed = ts.parseJsonConfigFileContent(configResult.config, ts.sys, cwd);
const diagnostics = parsed.errors.filter((error) => error.code !== 18003);
if (diagnostics.length > 0) {
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost),
  );
}

if (parsed.options.noEmit !== true) {
  throw new Error("Task 1 app tsconfig files must set noEmit=true.");
}

if (mode === "build") {
  const outputDir = path.join(cwd, "dist");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, ".loomic-build"),
    "Task 1 foundation build marker\n",
    "utf8",
  );
}

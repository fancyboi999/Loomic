import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import type { ProjectFileStore } from "../persistence/file-store.js";
import type { AgentWorkspace, FileInfo, GrepMatch } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_SEARCH_FILES = 10_000;

type Route = { kind: "local"; root: string; readonly: boolean } | { kind: "store"; namespace: string[]; readonly: boolean };

export function createWorkspace(options: {
  sandboxDir: string;
  workspaceRoot?: string;
  skillsRoot: string;
  canvasId?: string;
  fileStore?: ProjectFileStore;
  hasWorkspaceSkills?: boolean;
}): AgentWorkspace {
  const sandboxRoot = resolve(options.sandboxDir);
  const routes = new Map<string, Route>();
  if (options.workspaceRoot) {
    routes.set("/workspace/", { kind: "local", root: resolve(options.workspaceRoot), readonly: false });
  } else if (options.canvasId && options.fileStore) {
    routes.set("/workspace/", { kind: "store", namespace: ["projects", options.canvasId, "workspace"], readonly: false });
  }
  if (options.canvasId && options.fileStore) {
    routes.set("/memories/", { kind: "store", namespace: ["projects", options.canvasId, "memories"], readonly: false });
    if (options.hasWorkspaceSkills) {
      routes.set("/workspace-skills/", { kind: "store", namespace: ["projects", options.canvasId, "workspace-skills"], readonly: true });
    }
  }
  routes.set("/skills/", { kind: "local", root: resolve(options.skillsRoot), readonly: true });

  function select(rawPath: string): { route: Route; key: string; virtual: string } {
    if (!rawPath.startsWith("/") || rawPath.includes("\0") || rawPath.split("/").includes("..")) {
      throw new Error("Path must be an absolute virtual path without traversal.");
    }
    const virtual = rawPath.replace(/\/+$/, "") || "/";
    for (const [prefix, route] of routes) {
      if (virtual === prefix.slice(0, -1) || virtual.startsWith(prefix)) {
        const key = virtual.slice(prefix.length - 1) || "/";
        return { route, key, virtual };
      }
    }
    return { route: { kind: "local", root: sandboxRoot, readonly: false }, key: virtual, virtual };
  }

  async function localPath(root: string, key: string, writing = false): Promise<string> {
    const full = resolve(root, `.${key}`);
    if (!inside(full, root)) throw new Error("Path escapes its workspace root.");
    const realRoot = await realpath(root);
    const existing = writing ? dirname(full) : full;
    if (writing) await mkdir(existing, { recursive: true });
    const realExisting = await realpath(existing);
    if (!inside(realExisting, realRoot)) throw new Error("Path resolves outside its workspace root.");
    return full;
  }

  async function contents(path: string): Promise<string | null> {
    const { route, key } = select(path);
    if (route.kind === "store") return options.fileStore?.get(route.namespace, key) ?? null;
    try {
      return await readFile(await localPath(route.root, key), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async function allFiles(base: string): Promise<Array<{ path: string; content: string }>> {
    const { route, key, virtual } = select(base);
    if (route.kind === "store") {
      const files = await options.fileStore!.list(route.namespace);
      return files.filter((file) => key === "/" || file.key === key || file.key.startsWith(`${key}/`))
        .map((file) => ({ path: key === "/" ? `${virtual === "/" ? "" : virtual}${file.key}` : `${virtual}${file.key.slice(key.length)}`, content: file.content }));
    }
    const rootPath = await localPath(route.root, key);
    const output: Array<{ path: string; content: string }> = [];
    async function visit(current: string) {
      if (output.length >= MAX_SEARCH_FILES) return;
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const full = join(current, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await visit(full);
        else if (entry.isFile()) {
          output.push({ path: join(virtual, relative(rootPath, full)).replaceAll(sep, "/"), content: await readFile(full, "utf8") });
        }
      }
    }
    try {
      const info = await stat(rootPath);
      if (info.isFile()) return [{ path: virtual, content: await readFile(rootPath, "utf8") }];
      await visit(rootPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return output;
  }

  return {
    async lsInfo(path) {
      const { route, key, virtual } = select(path);
      if (route.kind === "store") {
        const files = await options.fileStore!.list(route.namespace);
        const prefix = key === "/" ? "/" : `${key}/`;
        const results = new Map<string, FileInfo>();
        for (const file of files) {
          if (!file.key.startsWith(prefix)) continue;
          const rest = file.key.slice(prefix.length);
          const first = rest.split("/")[0];
          if (!first) continue;
          const isDir = rest.includes("/");
          const itemPath = `${virtual === "/" ? "" : virtual}/${first}${isDir ? "/" : ""}`;
          results.set(itemPath, { path: itemPath, is_dir: isDir, ...(!isDir ? { size: file.content.length } : {}) });
        }
        return [...results.values()].sort((a, b) => a.path.localeCompare(b.path));
      }
      const full = await localPath(route.root, key);
      const entries = await readdir(full, { withFileTypes: true });
      const results: FileInfo[] = [];
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const isDir = entry.isDirectory();
        const itemPath = `${virtual === "/" ? "" : virtual}/${entry.name}${isDir ? "/" : ""}`;
        results.push({ path: itemPath, is_dir: isDir, ...(!isDir ? { size: (await stat(join(full, entry.name))).size } : {}) });
      }
      return results.sort((a, b) => a.path.localeCompare(b.path));
    },
    async read(path, offset = 0, limit = 500) {
      const content = await contents(path);
      if (content === null) return `Error: File not found: ${path}`;
      const lines = content.split("\n");
      return lines.slice(offset, offset + limit).map((line, index) => `${offset + index + 1}\t${line}`).join("\n");
    },
    async write(path, content) {
      const { route, key } = select(path);
      if (route.readonly) return { error: `Cannot write to read-only path: ${path}` };
      if (route.kind === "store") {
        const created = await options.fileStore!.create(route.namespace, key, content);
        return created ? { path } : { error: `File already exists: ${path}` };
      }
      const full = await localPath(route.root, key, true);
      try {
        await writeFile(full, content, { flag: "wx" });
        return { path };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return { error: `File already exists: ${path}` };
        throw error;
      }
    },
    async edit(path, oldString, newString, replaceAll = false) {
      const { route, key } = select(path);
      if (route.readonly) return { error: `Cannot edit read-only path: ${path}` };
      if (!oldString) return { error: "old_string must not be empty" };
      const content = await contents(path);
      if (content === null) return { error: `File not found: ${path}` };
      const occurrences = content.split(oldString).length - 1;
      if (!occurrences) return { error: "old_string not found" };
      if (occurrences > 1 && !replaceAll) return { error: `old_string matches ${occurrences} times; set replace_all to replace every match` };
      const updated = replaceAll ? content.replaceAll(oldString, newString) : content.replace(oldString, newString);
      if (route.kind === "store") await options.fileStore!.put(route.namespace, key, updated);
      else await writeFile(await localPath(route.root, key), updated);
      return { path, occurrences: replaceAll ? occurrences : 1 };
    },
    async globInfo(pattern, path = "/") {
      const matcher = globRegex(pattern);
      return (await allFiles(path)).filter((file) => matcher.test(globTarget(file.path, path, pattern)))
        .map((file) => ({ path: file.path, is_dir: false, size: file.content.length }));
    },
    async grepRaw(pattern, path = "/", glob = null) {
      let regex: RegExp;
      try { regex = new RegExp(pattern); } catch { return `Invalid regular expression: ${pattern}`; }
      const globMatcher = glob ? globRegex(glob) : null;
      const matches: GrepMatch[] = [];
      for (const file of await allFiles(path ?? "/")) {
        if (globMatcher && !globMatcher.test(globTarget(file.path, path ?? "/", glob!))) continue;
        file.content.split("\n").forEach((text, index) => {
          if (regex.test(text)) matches.push({ path: file.path, line: index + 1, text });
        });
      }
      return matches;
    },
    async execute(command) {
      const env = {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: sandboxRoot,
        FONT_DIR: join(options.skillsRoot, "canvas-design", "canvas-fonts"),
        PYTHONDONTWRITEBYTECODE: "1",
      };
      try {
        const { stdout, stderr } = await execFileAsync("/bin/sh", ["-lc", command], {
          cwd: sandboxRoot, env, timeout: 120_000, maxBuffer: 200_000,
        });
        return { output: `${stdout}${stderr}`, exitCode: 0, truncated: false };
      } catch (error) {
        const failed = error as Error & { code?: number | string; stdout?: string; stderr?: string };
        return { output: `${failed.stdout ?? ""}${failed.stderr ?? ""}${failed.message}`, exitCode: typeof failed.code === "number" ? failed.code : null, truncated: failed.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" };
      }
    },
  };
}

function globTarget(filePath: string, base: string, pattern: string): string {
  if (pattern.startsWith("/")) return filePath;
  if (!pattern.includes("/")) return basename(filePath);
  const prefix = base.replace(/\/+$/, "") || "";
  return filePath.startsWith(`${prefix}/`) ? filePath.slice(prefix.length + 1) : filePath;
}

function inside(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

function globRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0001")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0001/g, "(?:.*/)?")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`);
}

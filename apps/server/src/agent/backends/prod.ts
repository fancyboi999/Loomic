import {
  type BackendFactory,
  type BackendProtocol,
  CompositeBackend,
  type EditResult,
  type FileData,
  type FileDownloadResponse,
  type FileInfo,
  type FileUploadResponse,
  type GrepMatch,
  type StateAndStore,
  StateBackend,
  type WriteResult,
} from "deepagents";

export function createProductionBackendFactory(): BackendFactory {
  return (stateAndStore) =>
    new CompositeBackend(createEmptyRootBackend(), {
      "/memories/": new PrefixedStateBackend(stateAndStore, "/memories"),
      "/workspace/": new PrefixedStateBackend(stateAndStore, "/workspace"),
    });
}

function createEmptyRootBackend() {
  return new StateBackend({
    state: {
      files: {},
    },
  });
}

class PrefixedStateBackend implements BackendProtocol {
  private readonly backend: StateBackend;

  constructor(
    private readonly stateAndStore: StateAndStore,
    private readonly prefix: string,
  ) {
    this.backend = new StateBackend(stateAndStore);
  }

  lsInfo(path: string): FileInfo[] {
    return this.backend
      .lsInfo(toInternalPath(this.prefix, path))
      .map((entry) => ({
        ...entry,
        path: stripInternalPrefix(this.prefix, entry.path),
      }));
  }

  read(filePath: string, offset?: number, limit?: number): string {
    return this.backend.read(
      toInternalPath(this.prefix, filePath),
      offset,
      limit,
    );
  }

  readRaw(filePath: string): FileData {
    return this.backend.readRaw(toInternalPath(this.prefix, filePath));
  }

  grepRaw(
    pattern: string,
    path?: string | null,
    glob?: string | null,
  ): GrepMatch[] | string {
    const result = this.backend.grepRaw(
      pattern,
      toInternalPath(this.prefix, path ?? "/"),
      glob,
    );

    if (typeof result === "string") {
      return result;
    }

    return result.map((match) => ({
      ...match,
      path: stripInternalPrefix(this.prefix, match.path),
    }));
  }

  globInfo(pattern: string, path?: string): FileInfo[] {
    return this.backend
      .globInfo(pattern, toInternalPath(this.prefix, path ?? "/"))
      .map((entry) => ({
        ...entry,
        path: stripInternalPrefix(this.prefix, entry.path),
      }));
  }

  write(filePath: string, content: string): WriteResult {
    return mapWriteResult(
      this.prefix,
      this.backend.write(toInternalPath(this.prefix, filePath), content),
    );
  }

  edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll?: boolean,
  ): EditResult {
    return mapEditResult(
      this.prefix,
      this.backend.edit(
        toInternalPath(this.prefix, filePath),
        oldString,
        newString,
        replaceAll,
      ),
    );
  }

  uploadFiles(files: Array<[string, Uint8Array]>): FileUploadResponse[] {
    return this.backend
      .uploadFiles(
        files.map(([path, content]) => [
          toInternalPath(this.prefix, path),
          content,
        ]),
      )
      .map((response) => ({
        ...response,
        path: stripInternalPrefix(this.prefix, response.path),
      }));
  }

  downloadFiles(paths: string[]): FileDownloadResponse[] {
    return this.backend
      .downloadFiles(paths.map((path) => toInternalPath(this.prefix, path)))
      .map((response) => ({
        ...response,
        path: stripInternalPrefix(this.prefix, response.path),
      }));
  }
}

function mapWriteResult(prefix: string, result: WriteResult): WriteResult {
  return {
    ...result,
    ...(result.path ? { path: stripInternalPrefix(prefix, result.path) } : {}),
    ...(result.filesUpdate
      ? {
          filesUpdate: stripFilesUpdatePrefix(prefix, result.filesUpdate),
        }
      : {}),
  };
}

function mapEditResult(prefix: string, result: EditResult): EditResult {
  return {
    ...result,
    ...(result.path ? { path: stripInternalPrefix(prefix, result.path) } : {}),
    ...(result.filesUpdate
      ? {
          filesUpdate: stripFilesUpdatePrefix(prefix, result.filesUpdate),
        }
      : {}),
  };
}

function stripFilesUpdatePrefix(
  prefix: string,
  filesUpdate: Record<string, FileData>,
) {
  return Object.fromEntries(
    Object.entries(filesUpdate).map(([path, value]) => [
      stripInternalPrefix(prefix, path),
      value,
    ]),
  );
}

function toInternalPath(prefix: string, path: string) {
  const normalizedPath = normalizeAbsolutePath(path);

  if (normalizedPath === "/") {
    return prefix;
  }

  return `${prefix}${normalizedPath}`.replace(/\/{2,}/g, "/");
}

function stripInternalPrefix(prefix: string, path: string) {
  if (!path.startsWith(prefix)) {
    return path;
  }

  const stripped = path.slice(prefix.length);
  return stripped ? normalizeAbsolutePath(stripped) : "/";
}

function normalizeAbsolutePath(path: string) {
  if (!path) {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

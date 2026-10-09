export type FileInfo = { path: string; is_dir: boolean; size?: number };
export type GrepMatch = { path: string; line: number; text: string };

/** Virtual project files and the per-run shell share one path interface. */
export type AgentWorkspace = {
  lsInfo(path: string): Promise<FileInfo[]>;
  read(path: string, offset?: number, limit?: number): Promise<string>;
  write(path: string, content: string): Promise<unknown>;
  edit(path: string, oldString: string, newString: string, replaceAll?: boolean): Promise<unknown>;
  globInfo(pattern: string, path?: string): Promise<FileInfo[]>;
  grepRaw(pattern: string, path?: string | null, glob?: string | null): Promise<GrepMatch[] | string>;
  execute(command: string): Promise<unknown>;
};

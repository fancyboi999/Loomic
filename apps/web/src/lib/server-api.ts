import type {
  RunCreateRequest,
  RunCreateResponse,
  ViewerResponse,
  ProjectListResponse,
  ProjectCreateRequest,
  ProjectCreateResponse,
} from "@loomic/shared";

import { getServerBaseUrl } from "./env";

// --- Error types ---

export class ApiAuthError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "ApiAuthError";
  }
}

export class ApiApplicationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiApplicationError";
    this.code = code;
  }
}

// --- Existing ---

export async function createRun(payload: RunCreateRequest) {
  const response = await fetch(`${getServerBaseUrl()}/api/agent/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Run creation failed with status ${response.status}`);
  }

  return (await response.json()) as RunCreateResponse;
}

// --- Authenticated API ---

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function authJsonHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

async function handleErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new ApiAuthError();
  }
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? "application_error";
  const message = body?.error?.message ?? "Request failed";
  throw new ApiApplicationError(code, message);
}

export async function fetchViewer(
  accessToken: string,
): Promise<ViewerResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/viewer`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ViewerResponse;
}

export async function fetchProjects(
  accessToken: string,
): Promise<ProjectListResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/projects`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ProjectListResponse;
}

export async function createProject(
  accessToken: string,
  data: ProjectCreateRequest,
): Promise<ProjectCreateResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/projects`, {
    method: "POST",
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(data),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ProjectCreateResponse;
}

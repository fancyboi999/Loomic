import type { RunCreateRequest, RunCreateResponse } from "@loomic/shared";

import { getServerBaseUrl } from "./env";

export async function createRun(payload: RunCreateRequest) {
  const response = await fetch(`${getServerBaseUrl()}/api/agent/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Run creation failed with status ${response.status}`);
  }

  return (await response.json()) as RunCreateResponse;
}

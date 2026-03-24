// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentSection } from "../src/components/agent-section";

describe("AgentSection", () => {
  it("renders the az_sre/gpt-5.4 option when returned by the models API", async () => {
    render(
      <AgentSection
        defaultModel="gpt-5.4-mini"
        fetchModels={async () => ({
          models: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              provider: "openai",
            },
            {
              id: "az_sre/gpt-5.4",
              name: "AZ SRE GPT-5.4",
              provider: "openai",
            },
          ],
        })}
        onSave={vi.fn(async () => undefined)}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "AZ SRE GPT-5.4 (openai)" }),
      ).toBeInTheDocument(),
    );
  });
});

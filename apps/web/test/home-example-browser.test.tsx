// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeExampleBrowser } from "@/components/home-example-browser";
import { homeExampleSeedCategories } from "@/lib/home-example-seeds";

describe("HomeExampleBrowser", () => {
  afterEach(() => {
    cleanup();
  });

  it("expands design examples after clicking the Design chip", async () => {
    render(
      <HomeExampleBrowser
        categories={homeExampleSeedCategories}
        onExampleSelect={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Design a Bauhaus-inspired poster."),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Design" }));

    expect(
      await screen.findByText("Design a Bauhaus-inspired poster."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Brainstorm beautiful interiors."),
    ).toBeInTheDocument();
  });

  it("auto-selects the first example when a category chip is clicked", async () => {
    const onExampleSelect = vi.fn();

    render(
      <HomeExampleBrowser
        categories={homeExampleSeedCategories}
        onExampleSelect={onExampleSelect}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Design" }));

    expect(onExampleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryKey: "design",
        categoryLabel: "Design",
        title: "Design a Bauhaus-inspired poster.",
        prompt:
          "Make a poster for a music festival in the Bauhaus style. Use a limited color palette of pink, red, and cream. Abstract geometric shapes representing sound waves. Minimalist vertical text.",
        previewImages: expect.arrayContaining([expect.stringContaining("supabase.co")]),
      }),
    );
  });

  it("calls onExampleSelect with the picked example payload", async () => {
    const onExampleSelect = vi.fn();

    render(
      <HomeExampleBrowser
        categories={homeExampleSeedCategories}
        onExampleSelect={onExampleSelect}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Design" }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Design a ceramic dinnerware set\./i,
      }),
    );

    expect(onExampleSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        categoryKey: "design",
        categoryLabel: "Design",
        title: "Design a ceramic dinnerware set.",
        prompt:
          "Generate a set of 5 images, each a ceramic tableware piece: 1 small bowl, 1 large bowl, 1 small plate, 1 large plate, 1 mug. They belong to the same set, harmoniously blends Scandinavian minimalism and Japanese wabi-sabi aesthetics - soft neutral tones, organic textures, imperfect hand-thrown forms, subtle glaze variations, natural lighting. Each piece is photographed against a seamless white background; even studio production photography lighting.",
        previewImages: expect.arrayContaining([expect.stringContaining("supabase.co")]),
        inputMentions: [],
      }),
    );
  });
});

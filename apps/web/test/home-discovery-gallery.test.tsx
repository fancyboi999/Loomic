// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeDiscoveryGallery } from "@/components/home-discovery-gallery";
import { homeDiscoverySeedCategories } from "@/lib/home-discovery-seeds";

describe("HomeDiscoveryGallery", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows all discovery cards by default", () => {
    render(
      <HomeDiscoveryGallery
        categories={homeDiscoverySeedCategories}
        onCaseSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("灵感发现")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "The ART & Cultural Arts Center" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vintage Car Poster" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cat Tarot Cards" })).toBeInTheDocument();
  });

  it("filters cards when a category tab is selected", async () => {
    render(
      <HomeDiscoveryGallery
        categories={homeDiscoverySeedCategories}
        onCaseSelect={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "品牌设计" }));

    expect(screen.getByRole("button", { name: "The ART & Cultural Arts Center" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vintage Car Poster" })).not.toBeInTheDocument();
  });

  it("emits the internal Loomic seed payload when a card is clicked", async () => {
    const onCaseSelect = vi.fn();

    render(
      <HomeDiscoveryGallery
        categories={homeDiscoverySeedCategories}
        onCaseSelect={onCaseSelect}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "The ART & Cultural Arts Center" }),
    );

    expect(onCaseSelect).toHaveBeenCalledWith({
      authorAvatarUrl:
        "https://lh3.googleusercontent.com/a/ACg8ocJ0nBUJkE5T9tLTwRlVXScB576EqOEeRS-6__BLxjYxrO5Jtxjjig=s96-c",
      authorName: "Ken Allman",
      categoryKey: "branding-design",
      categoryLabel: "品牌设计",
      coverImageUrl: expect.stringContaining("supabase.co"),
      id: "ji5ey5l",
      likeCount: 7,
      prompt:
        "请基于 ART & Cultural Arts Center 这个灵感方向，为我做一套文化艺术中心品牌探索。输出品牌关键词、主视觉方向、海报延展和社交媒体视觉提案，整体气质要现代、文化感强、适合艺术活动传播。",
      title: "The ART & Cultural Arts Center",
      viewCount: 549,
    });
  });
});

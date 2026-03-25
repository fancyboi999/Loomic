import { describe, expect, it } from "vitest";

import { createDesktopLoadFailureUrl } from "../src/window-diagnostics.js";

describe("@loomic/desktop window diagnostics", () => {
  it("renders a safe error page for renderer load failures", () => {
    const failureUrl = createDesktopLoadFailureUrl({
      attemptedEntrypoint: "file:///tmp/<broken>.html",
      errorCode: -6,
      errorDescription: "ERR_FILE_NOT_FOUND",
    });

    expect(failureUrl.startsWith("data:text/html;charset=UTF-8,")).toBe(true);

    const html = decodeURIComponent(
      failureUrl.slice("data:text/html;charset=UTF-8,".length),
    );

    expect(html).toContain("Loomic desktop failed to load");
    expect(html).toContain("ERR_FILE_NOT_FOUND");
    expect(html).toContain("file:///tmp/&lt;broken&gt;.html");
    expect(html).not.toContain("file:///tmp/<broken>.html");
  });
});

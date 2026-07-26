import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LazyLoadErrorBoundary } from "./LazyLoadErrorBoundary.tsx";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LazyLoadErrorBoundary", () => {
  it("renders children without a failure", () => {
    render(
      <LazyLoadErrorBoundary description="Try again." title="Workspace unavailable">
        <p>Loaded workspace</p>
      </LazyLoadErrorBoundary>,
    );

    expect(screen.getByText("Loaded workspace")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("focuses an accessible recovery action and invokes retry once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      // React reports the intentionally thrown render error during this boundary test.
    });
    const retry = vi.fn(() => {
      // The production callback reloads the page.
    });

    render(
      <LazyLoadErrorBoundary
        description="Reload the latest application files."
        title="Cellar workspace could not be loaded"
        onRetry={retry}
      >
        <ThrowingChild />
      </LazyLoadErrorBoundary>,
    );

    expect(
      screen.getByRole("alert", { name: "Cellar workspace could not be loaded" }),
    ).toBeVisible();
    expect(screen.getByText("Reload the latest application files.")).toBeVisible();
    const button = screen.getByRole("button", { name: "Retry" });
    await waitFor(() => {
      expect(button).toHaveFocus();
    });

    await userEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps recovery available when the retry callback throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      // React reports the intentionally thrown render error during this boundary test.
    });

    render(
      <LazyLoadErrorBoundary
        description="Reload the latest application files."
        title="Workspace unavailable"
        onRetry={() => {
          throw new Error("reload unavailable");
        }}
      >
        <ThrowingChild />
      </LazyLoadErrorBoundary>,
    );

    const button = screen.getByRole("button", { name: "Retry" });
    await userEvent.click(button);
    expect(button).toHaveFocus();
    expect(screen.getByRole("alert", { name: "Workspace unavailable" })).toBeVisible();
  });
});

function ThrowingChild(): never {
  throw new Error("chunk failed");
}

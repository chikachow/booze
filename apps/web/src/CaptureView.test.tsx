import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CaptureArea, type CaptureSubmitResult } from "./CaptureView.tsx";
import { capturesFixture, locationsFixture, sitesFixture } from "./test/catalogue-fixtures.ts";
import type { CaptureFormState } from "./inventory-model.ts";

const captureForm = {
  location: "",
  position: "",
  quantity: "1",
  site: "Home cellar",
  siteId: "site-owner",
  storageLocationId: "",
} satisfies CaptureFormState;

async function resolvedTrue(): Promise<boolean> {
  return true;
}

async function resolvedCapture(): Promise<CaptureSubmitResult> {
  return { kind: "submitted", message: "Capture submitted." };
}

function renderCapture({
  onDelete = resolvedTrue,
  onImport = resolvedTrue,
  onRetry = resolvedTrue,
}: {
  readonly onDelete?: (captureId: string) => Promise<boolean>;
  readonly onImport?: (captureId: string, wineVintageId?: string) => Promise<boolean>;
  readonly onRetry?: (captureId: string) => Promise<boolean>;
} = {}) {
  return render(
    <CaptureArea
      captures={capturesFixture}
      form={captureForm}
      isSaving={false}
      locations={locationsFixture}
      sites={sitesFixture}
      writableSiteIds={new Set(["site-owner", "site-editor"])}
      onDelete={onDelete}
      onImport={onImport}
      onRetry={onRetry}
      onSubmit={resolvedCapture}
      setForm={vi.fn((nextForm: CaptureFormState): void => {
        void nextForm;
      })}
    />,
  );
}

function photo(name: string): File {
  return new File([name], name, { lastModified: 1, type: "image/jpeg" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CaptureArea photo picker", () => {
  it("accumulates sequential selections and gives explicit cap feedback", async () => {
    const user = userEvent.setup();
    renderCapture();
    const input = screen.getByLabelText(/Bottle photos/u);

    await user.upload(input, photo("front.jpg"));
    await user.upload(input, photo("back.jpg"));
    const description = screen.getByText((_content, element) => {
      return element?.id === "capture-bottle-photos-description";
    });
    expect(description).toHaveTextContent("2 of 4 selected.");

    await user.upload(input, [photo("side.jpg"), photo("detail.jpg"), photo("extra.jpg")]);
    expect(description).toHaveTextContent("4 of 4 selected.");
    expect(
      screen.getByText("Only 4 photos can be attached. 1 extra file was not added."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add more bottle photos" })).toBeDisabled();
  });

  it("silently ignores a duplicate without claiming a cap rejection", async () => {
    const user = userEvent.setup();
    renderCapture();
    const input = screen.getByLabelText(/Bottle photos/u);

    await user.upload(input, photo("front.jpg"));
    await user.upload(input, photo("front.jpg"));

    expect(screen.getByText(/1 of 4 selected/u)).toBeInTheDocument();
    expect(screen.queryByText(/extra file/u)).not.toBeInTheDocument();
  });

  it("removes a selected photo and releases its preview URL", async () => {
    const user = userEvent.setup();
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    renderCapture();
    const input = screen.getByLabelText(/Bottle photos/u);

    await user.upload(input, [photo("front.jpg"), photo("back.jpg")]);
    await user.click(
      screen.getByRole("button", {
        name: "Remove front.jpg — Preview of front.jpg",
      }),
    );

    expect(screen.queryByText("front.jpg")).not.toBeInTheDocument();
    expect(screen.getAllByText("back.jpg")).not.toHaveLength(0);
    expect(screen.getByText(/1 of 4 selected/u)).toBeInTheDocument();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("releases every remaining preview URL when capture unmounts", async () => {
    const user = userEvent.setup();
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    const { unmount } = renderCapture();

    await user.upload(screen.getByLabelText(/Bottle photos/u), [
      photo("front.jpg"),
      photo("back.jpg"),
    ]);
    revokeObjectUrl.mockClear();
    unmount();

    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
  });

  it("has no automated accessibility violations", async () => {
    const { container } = renderCapture();
    const result = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });

  it("confirms deletion, blocks repeat activation, and keeps local failure feedback", async () => {
    const user = userEvent.setup();
    let resolveDelete: ((deleted: boolean) => void) | undefined;
    const onDelete = vi.fn(
      async () =>
        new Promise<boolean>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    renderCapture({ onDelete });

    const deleteTriggers = screen.getAllByRole("button", { name: "Delete capture" });
    const deleteTrigger = deleteTriggers.at(-1);
    if (deleteTrigger === undefined) {
      throw new Error("Expected a deletable capture fixture.");
    }
    await user.click(deleteTrigger);
    expect(onDelete).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog", { name: "Delete this capture?" });
    const deleteAction = within(dialog).getByRole("button", { name: "Delete capture" });
    await user.click(deleteAction);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(deleteAction).toBeDisabled();

    resolveDelete?.(false);
    expect(await screen.findByText("Delete failed. Try again.")).toBeVisible();
    expect(dialog).toBeVisible();
    await waitFor(() => {
      expect(deleteAction).toBeEnabled();
    });
  });
});

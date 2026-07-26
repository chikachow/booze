import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DestructiveActionDialog } from "./DestructiveActionDialog.tsx";

describe("DestructiveActionDialog", () => {
  it("keeps accessible failure feedback inside the active alert dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <DestructiveActionDialog
        actionLabel="Delete bottle"
        description="This cannot be undone."
        failureMessage="Bottle was not deleted. Try again."
        isOpen
        title="Delete this bottle?"
        onAction={async () => false}
        onOpenChange={(isOpen) => {
          onOpenChange(isOpen);
        }}
      />,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Delete this bottle?" });
    await user.click(screen.getByRole("button", { name: "Delete bottle" }));

    expect(await screen.findByText("Bottle was not deleted. Try again.")).toBeVisible();
    expect(dialog).toContainElement(screen.getByRole("alert"));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("blocks repeat activation and closes only after success", async () => {
    const user = userEvent.setup();
    let resolveAction: ((result: boolean) => void) | undefined;
    const onAction = vi.fn(
      async () =>
        new Promise<boolean>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const onOpenChange = vi.fn();

    render(
      <DestructiveActionDialog
        actionLabel="Delete site"
        description="This cannot be undone."
        failureMessage="Site was not deleted. Try again."
        isOpen
        title="Delete this site?"
        onAction={onAction}
        onOpenChange={(isOpen) => {
          onOpenChange(isOpen);
        }}
      />,
    );

    const action = screen.getByRole("button", { name: "Delete site" });
    await user.dblClick(action);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(action).toBeDisabled();

    resolveAction?.(true);
    expect(await screen.findByRole("button", { name: "Delete site" })).toBeEnabled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

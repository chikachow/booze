import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { ProgressiveListStatus } from "./ProgressiveListStatus.tsx";

function Harness(): ReactElement {
  const [visibleCount, setVisibleCount] = useState(2);
  const records = ["First", "Second", "Third", "Fourth", "Fifth"];
  return (
    <>
      {records.slice(0, visibleCount).map((record, index) => (
        <article id={`record-${index}`} key={record} tabIndex={-1}>
          {record}
          <button type="button">Edit {record}</button>
        </article>
      ))}
      <ProgressiveListStatus
        getRevealFocusTarget={(firstRevealedIndex) =>
          document.querySelector(`#record-${firstRevealedIndex}`)
        }
        itemLabel="records"
        pageSize={2}
        totalCount={records.length}
        visibleCount={visibleCount}
        onReveal={setVisibleCount}
      />
    </>
  );
}

describe("ProgressiveListStatus", () => {
  it("focuses the first record in every newly revealed page", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Show 2 more" }));

    const status = screen.getByText("Showing 4 of 5 records");
    expect(status).toHaveTextContent("Showing 4 of 5 records");
    await waitFor(() => {
      expect(screen.getByText("Third").closest("article")).toHaveFocus();
    });
    await user.tab();
    expect(screen.getByRole("button", { name: "Edit Third" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(status).toHaveTextContent("Showing all 5 records");
    await waitFor(() => {
      expect(screen.getByText("Fifth").closest("article")).toHaveFocus();
    });
  });

  it("still reveals records when no focus target is available", async () => {
    const user = userEvent.setup();
    render(
      <ProgressiveListStatus
        getRevealFocusTarget={() => null}
        itemLabel="records"
        pageSize={2}
        totalCount={3}
        visibleCount={2}
        onReveal={() => {
          // The owner may rerender without a focusable target.
        }}
      />,
    );

    await expect(
      user.click(screen.getByRole("button", { name: "Show 1 more" })),
    ).resolves.toBeUndefined();
  });
});

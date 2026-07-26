import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { ProgressiveListStatus } from "./ProgressiveListStatus.tsx";

function Harness(): ReactElement {
  const [visibleCount, setVisibleCount] = useState(2);
  return (
    <ProgressiveListStatus
      itemLabel="records"
      pageSize={2}
      totalCount={3}
      visibleCount={visibleCount}
      onReveal={setVisibleCount}
    />
  );
}

describe("ProgressiveListStatus", () => {
  it("retains a live focus target after revealing the final page", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Show 1 more" }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Showing all 3 records");
    await waitFor(() => {
      expect(status).toHaveFocus();
    });
  });
});

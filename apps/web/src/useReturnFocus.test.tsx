import { render } from "@testing-library/react";
import { useEffect, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { useReturnFocus } from "./useReturnFocus.ts";

function Harness({
  isOpen,
  trigger,
}: {
  readonly isOpen: boolean;
  readonly trigger: HTMLElement;
}): ReactElement {
  const captureTrigger = useReturnFocus(isOpen, "#fallback");
  useEffect(() => {
    if (isOpen) {
      captureTrigger(trigger);
    }
  }, [captureTrigger, isOpen, trigger]);
  return <div />;
}

describe("useReturnFocus", () => {
  it("restores the exact connected opener after close", () => {
    const trigger = document.createElement("button");
    document.documentElement.insertAdjacentElement("beforeend", trigger);
    const { rerender } = render(<Harness isOpen trigger={trigger} />);

    rerender(<Harness isOpen={false} trigger={trigger} />);

    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("uses the fallback when the opener was removed", () => {
    const trigger = document.createElement("button");
    const fallback = document.createElement("button");
    fallback.id = "fallback";
    document.documentElement.insertAdjacentElement("beforeend", trigger);
    document.documentElement.insertAdjacentElement("beforeend", fallback);
    const { rerender } = render(<Harness isOpen trigger={trigger} />);
    trigger.remove();

    rerender(<Harness isOpen={false} trigger={trigger} />);

    expect(fallback).toHaveFocus();
    fallback.remove();
  });
});

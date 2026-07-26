import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useKeyedAsyncOperation } from "./useKeyedAsyncOperation.ts";

describe("useKeyedAsyncOperation", () => {
  it("owns keyed pending state and persistent failure feedback", async () => {
    let resolve: ((value: boolean) => void) | undefined;
    const action = vi.fn(
      async () =>
        new Promise<boolean>((resolveAction) => {
          resolve = resolveAction;
        }),
    );
    const { result } = renderHook(() =>
      useKeyedAsyncOperation({
        exceptionMessage: "Connection failed.",
        failureMessage: "Save failed.",
      }),
    );

    let operation: Promise<void> | undefined;
    act(() => {
      operation = result.current.run("location-1", action);
    });
    expect(result.current.pendingKey).toBe("location-1");

    await act(async () => {
      resolve?.(false);
      await operation;
    });
    expect(result.current.error).toEqual({ key: "location-1", message: "Save failed." });
    expect(result.current.pendingKey).toBeNull();
  });
});

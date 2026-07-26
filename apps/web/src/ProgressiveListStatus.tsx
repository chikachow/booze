import { Button } from "@astryxdesign/core/Button";
import type { ReactElement } from "react";

export const PROGRESSIVE_PAGE_SIZE = 50;

export function ProgressiveListStatus({
  getRevealFocusTarget,
  itemLabel,
  pageSize = PROGRESSIVE_PAGE_SIZE,
  totalCount,
  visibleCount,
  onReveal,
}: {
  readonly getRevealFocusTarget: (firstRevealedIndex: number) => HTMLElement | null;
  readonly itemLabel: string;
  readonly pageSize?: number;
  readonly totalCount: number;
  readonly visibleCount: number;
  readonly onReveal: (nextVisibleCount: number) => void;
}): ReactElement | null {
  if (totalCount <= pageSize) {
    return null;
  }
  const remainingCount = totalCount - visibleCount;
  const revealCount = Math.min(pageSize, remainingCount);
  return (
    <div className="inventory-pagination">
      <p aria-live="polite" role="status">
        {remainingCount === 0
          ? `Showing all ${totalCount} ${itemLabel}`
          : `Showing ${visibleCount} of ${totalCount} ${itemLabel}`}
      </p>
      {remainingCount === 0 ? null : (
        <Button
          label={`Show ${revealCount} more`}
          onClick={() => {
            const firstRevealedIndex = visibleCount;
            onReveal(visibleCount + revealCount);
            requestAnimationFrame(() => {
              getRevealFocusTarget(firstRevealedIndex)?.focus();
            });
          }}
        />
      )}
    </div>
  );
}

import { Button } from "@astryxdesign/core/Button";
import { useRef, type ReactElement } from "react";

export const PROGRESSIVE_PAGE_SIZE = 50;

export function ProgressiveListStatus({
  itemLabel,
  pageSize = PROGRESSIVE_PAGE_SIZE,
  totalCount,
  visibleCount,
  onReveal,
}: {
  readonly itemLabel: string;
  readonly pageSize?: number;
  readonly totalCount: number;
  readonly visibleCount: number;
  readonly onReveal: (nextVisibleCount: number) => void;
}): ReactElement | null {
  const statusRef = useRef<HTMLParagraphElement>(null);
  if (totalCount <= pageSize) {
    return null;
  }
  const remainingCount = totalCount - visibleCount;
  const revealCount = Math.min(pageSize, remainingCount);
  return (
    <div className="inventory-pagination">
      <p aria-live="polite" ref={statusRef} role="status" tabIndex={-1}>
        {remainingCount === 0
          ? `Showing all ${totalCount} ${itemLabel}`
          : `Showing ${visibleCount} of ${totalCount} ${itemLabel}`}
      </p>
      {remainingCount === 0 ? null : (
        <Button
          label={`Show ${revealCount} more`}
          onClick={() => {
            onReveal(visibleCount + revealCount);
            requestAnimationFrame(() => {
              statusRef.current?.focus();
            });
          }}
        />
      )}
    </div>
  );
}

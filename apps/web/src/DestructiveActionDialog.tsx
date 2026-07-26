import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";

export type DestructiveActionDialogProps = {
  readonly actionLabel: string;
  readonly description: string;
  readonly failureMessage: string;
  readonly isOpen: boolean;
  readonly title: string;
  readonly onAction: () => Promise<boolean>;
  readonly onOpenChange: (isOpen: boolean) => void;
};

export function DestructiveActionDialog({
  actionLabel,
  description,
  failureMessage,
  isOpen,
  title,
  onAction,
  onOpenChange,
}: DestructiveActionDialogProps): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();

  useEffect(() => {
    if (isOpen) {
      setError(null);
      requestAnimationFrame(() => {
        cancelRef.current?.focus();
      });
    }
  }, [isOpen]);

  async function runAction(): Promise<void> {
    if (isPending) {
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      if (await onAction()) {
        onOpenChange(false);
      } else {
        setError(failureMessage);
      }
    } catch {
      setError(failureMessage);
    } finally {
      setIsPending(false);
    }
  }

  function changeOpen(nextIsOpen: boolean): void {
    if (!isPending) {
      onOpenChange(nextIsOpen);
    }
  }

  return (
    <Dialog
      aria-describedby={descriptionId}
      aria-label={title}
      isOpen={isOpen}
      purpose="form"
      role="alertdialog"
      width={440}
      onOpenChange={changeOpen}
    >
      <DialogHeader title={title} />
      <div className="destructive-dialog-content">
        <p className="field-hint" id={descriptionId}>
          {description}
        </p>
        {error === null ? null : <Banner status="error" title={error} />}
        <div className="dialog-actions">
          <Button
            ref={cancelRef}
            isDisabled={isPending}
            label="Cancel"
            variant="ghost"
            onClick={() => {
              changeOpen(false);
            }}
          />
          <Button
            isLoading={isPending}
            label={actionLabel}
            variant="destructive"
            onClick={() => {
              void runAction();
            }}
          />
        </div>
      </div>
    </Dialog>
  );
}

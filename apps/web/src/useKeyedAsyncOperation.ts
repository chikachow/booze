import { useState } from "react";

type OperationError<Key> = {
  readonly key: Key;
  readonly message: string;
};

type KeyedAsyncOperation<Key> = {
  readonly clearError: () => void;
  readonly error: OperationError<Key> | null;
  readonly pendingKey: Key | null;
  readonly reportError: (key: Key, message: string) => void;
  readonly run: (key: Key, action: () => Promise<boolean>) => Promise<void>;
};

export function useKeyedAsyncOperation<Key>({
  exceptionMessage,
  failureMessage,
}: {
  readonly exceptionMessage: string;
  readonly failureMessage: string;
}): KeyedAsyncOperation<Key> {
  const [pendingKey, setPendingKey] = useState<Key | null>(null);
  const [error, setError] = useState<OperationError<Key> | null>(null);

  async function run(key: Key, action: () => Promise<boolean>): Promise<void> {
    if (pendingKey !== null) {
      return;
    }
    setPendingKey(key);
    setError(null);
    try {
      if (!(await action())) {
        setError({ key, message: failureMessage });
      }
    } catch {
      setError({ key, message: exceptionMessage });
    } finally {
      setPendingKey(null);
    }
  }

  return {
    clearError: (): void => {
      setError(null);
    },
    error,
    pendingKey,
    reportError: (key: Key, message: string): void => {
      setError({ key, message });
    },
    run,
  };
}

export type ErrorDetails = {
  readonly name?: string;
  readonly message: string;
  readonly stack?: string;
};

type LogField = boolean | number | string | null | readonly unknown[] | ErrorDetails;

export function errorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  return { message: String(error) };
}

export function logError(event: string, fields: Record<string, LogField>): void {
  // oxlint-disable-next-line no-console -- Worker logs are the production observability sink.
  console.error(JSON.stringify({ level: "error", event, ...fields }));
}

export function logInfo(event: string, fields: Record<string, LogField>): void {
  // oxlint-disable-next-line no-console -- Worker logs are the production observability sink.
  console.log(JSON.stringify({ level: "info", event, ...fields }));
}

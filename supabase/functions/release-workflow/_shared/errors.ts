export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

export class ProviderError extends Error {
  constructor() {
    super('Store provider request failed.');
    this.name = 'ProviderError';
  }
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof RequestError) {
    return Response.json(
      { error: { code: 'invalid_request' } },
      { status: 400 },
    );
  }

  return Response.json({ error: { code: 'internal_error' } }, { status: 500 });
}

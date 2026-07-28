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

export class RevisionConflictError extends Error {
  constructor() {
    super('Release state revision conflict.');
    this.name = 'RevisionConflictError';
  }
}

export class ReleaseStateError extends Error {
  constructor() {
    super('Release state request failed.');
    this.name = 'ReleaseStateError';
  }
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof RequestError) {
    return Response.json(
      { error: { code: 'invalid_request' } },
      { status: 400 },
    );
  }

  if (error instanceof RevisionConflictError) {
    return Response.json(
      { error: { code: 'revision_conflict' } },
      { status: 409 },
    );
  }

  return Response.json({ error: { code: 'internal_error' } }, { status: 500 });
}

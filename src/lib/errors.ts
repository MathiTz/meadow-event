/**
 * Error raised by the OMDb / Resend wrappers. `retriable` tells the Inngest
 * function whether another attempt could plausibly succeed.
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly retriable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/** OMDb has no movie with that title. Not a failure: the recipient gets a "not found" email. */
export class MovieNotFoundError extends ServiceError {
  constructor(readonly title: string) {
    super(`OMDb: Movie not found: ${title}`, false);
    this.name = "MovieNotFoundError";
  }
}

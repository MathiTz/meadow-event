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

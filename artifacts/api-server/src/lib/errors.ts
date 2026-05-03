export type ApiErrorCode =
  | "missing_authorization"
  | "invalid_api_key"
  | "revoked_api_key"
  | "forbidden_origin"
  | "rate_limited"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "payload_too_large"
  | "request_timeout"
  | "validation_error"
  | "not_found"
  | "conflict"
  | "internal_error"
  | "service_unavailable";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: string;

  constructor(args: {
    code: ApiErrorCode;
    status: number;
    message: string;
    details?: string;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
  }
}

export interface ErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    request_id: string;
    details?: string;
  };
}

export function envelope(err: ApiError, requestId: string): ErrorEnvelope {
  return {
    error: {
      code: err.code,
      message: err.message,
      request_id: requestId,
      ...(err.details ? { details: err.details } : {}),
    },
  };
}

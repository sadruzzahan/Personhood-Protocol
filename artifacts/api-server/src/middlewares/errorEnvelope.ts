import type { Request, Response, NextFunction } from "express";
import { ApiError, envelope } from "../lib/errors";
import { logger } from "../lib/logger";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    new ApiError({
      code: "not_found",
      status: 404,
      message: `No route matches ${req.method} ${req.path}`,
    }),
  );
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Express requires the 4-arg signature for error middleware.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? "unknown";

  let apiErr: ApiError;
  if (err instanceof ApiError) {
    apiErr = err;
  } else if (err instanceof Error) {
    logger.error(
      { err, requestId, path: req.path, method: req.method },
      "Unhandled error",
    );
    apiErr = new ApiError({
      code: "internal_error",
      status: 500,
      message: "Internal server error",
    });
  } else {
    logger.error({ err, requestId }, "Unknown thrown value");
    apiErr = new ApiError({
      code: "internal_error",
      status: 500,
      message: "Internal server error",
    });
  }

  // Centralize error_code attribution so request_logs always reflects the
  // typed code, regardless of which middleware/route raised it.
  res.locals.errorCode = apiErr.code;

  if (!res.headersSent) {
    res.status(apiErr.status).json(envelope(apiErr, requestId));
  }
}

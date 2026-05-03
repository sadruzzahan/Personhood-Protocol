import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../lib/errors";

export function timeoutMiddleware(ms: number) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const handle = setTimeout(() => {
      if (res.headersSent) return;
      next(
        new ApiError({
          code: "request_timeout",
          status: 408,
          message: `Request exceeded ${ms}ms server-side timeout`,
        }),
      );
    }, ms);
    res.on("finish", () => clearTimeout(handle));
    res.on("close", () => clearTimeout(handle));
    next();
  };
}

import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

const HEADER = "x-request-id";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(HEADER);
  // Only trust incoming UUIDs to avoid log-injection / spoofing.
  const isUuid =
    typeof incoming === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      incoming,
    );
  const id = isUuid ? incoming : uuidv4();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}

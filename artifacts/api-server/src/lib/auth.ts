import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

const userIdMap = new WeakMap<Request, string>();

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  userIdMap.set(req, userId);
  next();
}

export function getUserId(req: Request): string {
  const userId = userIdMap.get(req);
  if (!userId) {
    throw new Error("getUserId called on a request without authentication");
  }
  return userId;
}

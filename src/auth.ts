import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
const secret = () =>
  process.env.JWT_SECRET || "development_only_change_this_secret";
export function signToken(user: {
  _id: any;
  name: string;
  email: string;
  photoURL?: string;
}) {
  return jwt.sign(
    {
      id: String(user._id),
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
    },
    secret(),
    { expiresIn: "7d" },
  );
}
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.studio_token;
    if (!token)
      return res.status(401).json({ message: "Please log in to continue" });
    (req as any).user = jwt.verify(token, secret());
    next();
  } catch {
    return res
      .status(401)
      .json({ message: "Your session has expired. Please log in again." });
  }
}
export function setAuthCookie(res: Response, token: string) {
  res.cookie("studio_token", token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: process.env.COOKIE_SECURE === "true" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

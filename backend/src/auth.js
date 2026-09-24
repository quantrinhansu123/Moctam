import jwt from "jsonwebtoken";
import { settings } from "./config.js";

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ status: "error", message: "No Authorization header" });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, settings.jwtSecret);
    if (payload.role !== "Admin") {
      return res.status(403).json({ status: "error", message: "Require Admin role" });
    }
    req.admin = { id: payload.sub };
    return next();
  } catch {
    return res.status(401).json({ status: "error", message: "Invalid Token" });
  }
}

export function signAdminToken(username) {
  return jwt.sign({ sub: username, role: "Admin" }, settings.jwtSecret, {
    expiresIn: "24h",
  });
}

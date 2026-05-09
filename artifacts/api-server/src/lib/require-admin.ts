import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAdminUser(email: string | undefined, role: string | undefined): boolean {
  if (role === "admin") return true;
  if (email && adminEmails.includes(email.toLowerCase())) return true;
  return false;
}

const devBypassEnabled =
  process.env.NODE_ENV !== "production" &&
  process.env.ADMIN_DEV_BYPASS === "1";

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Default-deny: an admin role/allowlist must be configured. A dev bypass
  // is available only when explicitly opted in via ADMIN_DEV_BYPASS=1 in a
  // non-production environment.
  if (!supabase) {
    if (devBypassEnabled) {
      next();
      return;
    }
    res.status(503).json({
      error:
        "Admin authentication is not configured. Set SUPABASE_URL/SUPABASE_ANON_KEY (and ADMIN_EMAILS) on the server.",
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const role =
    (data.user.app_metadata as { role?: string } | undefined)?.role ??
    (data.user.user_metadata as { role?: string } | undefined)?.role;
  if (!isAdminUser(data.user.email, role)) {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  next();
}

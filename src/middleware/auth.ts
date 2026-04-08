import type { Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { profiles } from "../db/schema.js";
import type { AuthenticatedRequest } from "../types/index.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SECRET_KEY must be set in environment variables",
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res
        .status(401)
        .json({ error: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.substring(7);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    // Ensure profile exists (auto-create on first authenticated request)
    const [existing] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id));

    if (!existing) {
      await db.insert(profiles).values({
        id: user.id,
        name: user.user_metadata?.name ?? user.email?.split("@")[0] ?? "User",
      });
    }

    req.user = {
      id: user.id,
      email: user.email!,
    };

    next();
  } catch (error) {
    res.status(401).json({ error: "Authentication failed" });
  }
}

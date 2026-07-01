import { Hono } from "hono";
import { z } from "zod";
import { getCategoryPulse } from "../../services/trends-service.js";

const trendsQuerySchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .default("US"),
  growthPeriod: z.enum(["7d", "14d", "30d", "60d", "90d"]).default("7d"),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const trendsRouter = new Hono();

trendsRouter.get("/", async (c) => {
  const parsed = trendsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const invalid = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean))];
    return c.json({ error: "Invalid query parameters", invalid }, 400);
  }

  return c.json(await getCategoryPulse(parsed.data));
});

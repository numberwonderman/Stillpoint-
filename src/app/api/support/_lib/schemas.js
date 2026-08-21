/**
 * Zod schemas shared across the /api/support pipeline.
 */

import { z } from "zod";

export const ResourceSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  why: z.string().optional(),
  phone: z.string().optional(),
  url: z.string().optional(),
  address: z.string().optional(),
  availability: z.string().optional(),
  isCrisis: z.boolean().optional(),
});

export const IntentSchema = z.object({
  needsResources: z.boolean(),
  resourceQuery: z.string().optional(),
  reason: z.string().optional(),
});

export const RankedResourcesSchema = z.object({
  rankedResources: z.array(ResourceSchema),
});

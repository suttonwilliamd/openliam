import { z } from "zod";

export const FluxerConfigSchema = z.object({
  token: z.string().min(1, "Bot token is required"),
  enabled: z.boolean().default(true),
});

export type FluxerConfig = z.infer<typeof FluxerConfigSchema>;

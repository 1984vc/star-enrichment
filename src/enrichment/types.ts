import { z } from "zod";

export const EmployerSchema = z.object({
  name: z.string(),
  current: z.boolean(),
});

export const EnrichedProfileSchema = z.object({
  country: z.string().nullable(),
  employers: z.array(EmployerSchema),
  linkedin_url: z.string().nullable(),
  website_url: z.string().nullable(),
  university: z.string().nullable(),
});

export type EnrichedProfile = z.infer<typeof EnrichedProfileSchema>;
export type Employer = z.infer<typeof EmployerSchema>;

import { z } from "zod";

/** The editable details of a project (create and edit forms). */
export const ProjectFields = z.object({
  property: z.object({
    address: z.string().trim().min(1, "Add the property address.").max(200),
    city: z.string().trim().max(120).default(""),
    kind: z.string().trim().max(120).default(""),
  }),
  inspection: z.object({ date: z.string().trim().max(40).default(""), type: z.string().trim().max(60).default("New construction") }),
  company: z.object({
    name: z.string().trim().max(120).default(""),
    people: z.array(z.string().trim().max(60)).max(8).default([]),
    phone: z.string().trim().max(40).default(""),
    website: z.string().trim().max(120).default(""),
    accent: z.string().trim().regex(/^(#[0-9a-fA-F]{6})?$/, "Use a hex color like #FFD23F.").default(""),
  }),
  voice: z.object({ mode: z.enum(["ai", "source"]), voice: z.string().trim().max(20).default("ash") }),
  notes: z.string().max(10_000).default(""),
});

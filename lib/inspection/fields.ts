import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).default("");

/** The editable details of a project (create and edit forms). */
export const ProjectFields = z.object({
  vertical: z.enum(["home", "vehicle"]).default("home"),
  property: z.object({ address: text(200), city: text(120), kind: text(120) }).default({}),
  vehicle: z.object({
    year: z.string().trim().regex(/^((19|20)\d\d)?$/, "Use a four-digit year.").default(""),
    make: text(40),
    model: text(60),
    trim: text(60),
    vin: z.string().trim().toUpperCase().max(17, "A VIN is 17 characters.").default(""),
    mileage: text(20),
    location: text(120),
  }).default({}),
  inspection: z.object({ date: text(40), type: z.string().trim().max(60).default("New construction") }),
  company: z.object({
    name: text(120),
    people: z.array(z.string().trim().max(60)).max(8).default([]),
    phone: text(40),
    website: text(120),
    accent: z.string().trim().regex(/^(#[0-9a-fA-F]{6})?$/, "Use a hex color like #FFD23F.").default(""),
  }),
  voice: z.object({ mode: z.enum(["ai", "source"]), voice: z.string().trim().max(20).default("ash") }),
  notes: z.string().max(10_000).default(""),
}).superRefine((f, ctx) => {
  if (f.vertical === "home" && !f.property.address) ctx.addIssue({ code: "custom", path: ["property", "address"], message: "Add the property address." });
  if (f.vertical === "vehicle" && !(f.vehicle.make && f.vehicle.model)) ctx.addIssue({ code: "custom", path: ["vehicle", "model"], message: "Add the vehicle's make and model." });
});

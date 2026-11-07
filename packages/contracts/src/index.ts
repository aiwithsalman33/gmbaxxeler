import { z } from "zod";

export const phoneSchema = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +919876543210");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(200);

export const registerSchema = z.object({ email: emailSchema, password: passwordSchema, name: z.string().trim().min(1).max(120).optional() });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export const emailOnlySchema = z.object({ email: emailSchema });
export const tokenSchema = z.object({ token: z.string().min(16).max(200) });
export const resetPasswordSchema = z.object({ token: z.string().min(16).max(200), password: passwordSchema });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema });
export const inviteMemberSchema = z.object({ email: emailSchema, role: z.enum(["owner", "member"]).default("member") });
export const acceptInviteSchema = z.object({ password: passwordSchema.optional(), name: z.string().trim().min(1).max(120).optional() });

export const addClientSchema = z
  .object({
    businessName: z.string().trim().min(2).max(200),
    contactPhone: phoneSchema.optional(),
    contactEmail: z.string().trim().email().optional(),
    address: z.string().trim().max(400).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.contactPhone || v.contactEmail, {
    message: "Enter a mobile number or a Gmail address",
    path: ["contactPhone"],
  });

export const updateClientSchema = z.object({
  aiRenameEnabled: z.boolean().optional(),
  name: z.string().trim().min(2).max(200).optional(),
  contactPhone: phoneSchema.nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  address: z.string().trim().max(400).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
  paused: z.boolean().optional(),
});

export const locationRefSchema = z.object({ accountId: z.string().min(1), locationId: z.string().min(1) });
export const importClientsSchema = z.object({ locations: z.array(locationRefSchema).min(1).max(100) });
export const guideChannelSchema = z.enum(["copy", "whatsapp", "sms"]);
export const sendGuideSchema = z.object({ channel: guideChannelSchema });
export const matchInvitationSchema = z.object({ clientId: z.string().uuid() });
export const dateRangeSchema = z.object({ range: z.coerce.number().pipe(z.union([z.literal(7), z.literal(28), z.literal(90)])).default(28) });
export const folderKindSchema = z.enum(["photos", "seo_images"]);
export const updateImageSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  folder: folderKindSchema.optional(),
});
export const bulkMoveSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200), folder: folderKindSchema });

const ctaTypeSchema = z.enum(["LEARN_MORE", "BOOK", "ORDER", "SHOP", "SIGN_UP", "CALL"]);

/** COVER and PROFILE are left out: they replace a profile's main images. */
export const PHOTO_CATEGORIES = ["ADDITIONAL", "EXTERIOR", "INTERIOR", "PRODUCT", "AT_WORK", "FOOD_AND_DRINK", "MENU", "COMMON_AREA", "ROOMS", "TEAMS"] as const;
export const photoCategorySchema = z.enum(PHOTO_CATEGORIES);

const isTimezone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export const photoScheduleSchema = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).transform((days) => [...new Set(days)].sort()),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"),
  timezone: z.string().refine(isTimezone, "Unknown timezone"),
  countPerDay: z.number().int().min(1).max(10),
  defaultCategory: photoCategorySchema.default("ADDITIONAL"),
  enabled: z.boolean().default(true),
});

export const updateJobSchema = z
  .object({
    runAt: z.coerce.date().optional(),
    category: photoCategorySchema.optional(),
    imageId: z.string().uuid().optional(),
  })
  .refine((job) => job.runAt || job.category || job.imageId, "Nothing to change");

const list = (max = 50) => z.array(z.string().trim().min(1).max(200)).max(max).default([]);

export const profileSchema = z.object({
  description: z.string().trim().max(3000).nullable().optional(),
  services: list(),
  targetAreas: list(),
  usps: list(),
  tone: z.string().trim().max(500).nullable().optional(),
  strategy: z.string().trim().max(3000).nullable().optional(),
  competitors: list(),
  keywords: list(),
  dos: list(),
  donts: list(),
  ctaUrl: z.string().url().nullable().optional(),
});

export const seoScheduleSchema = photoScheduleSchema
  .omit({ defaultCategory: true })
  .extend({
    countPerDay: z.number().int().min(1).max(5),
    seoMode: z.enum(["auto", "draft"]).default("draft"),
    draftLeadHours: z.number().int().min(1).max(168).default(48),
    ctaType: ctaTypeSchema.default("LEARN_MORE"),
    ctaUrl: z.string().url().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.ctaType !== "CALL" && !value.ctaUrl) ctx.addIssue({ code: "custom", path: ["ctaUrl"], message: "Add the link for this button" });
  });

export const updatePostSchema = z
  .object({ summary: z.string().trim().min(1).max(1500), ctaType: ctaTypeSchema, ctaUrl: z.string().url().nullable().optional() })
  .superRefine((post, ctx) => {
    if (post.ctaType === "CALL" && post.ctaUrl) ctx.addIssue({ code: "custom", path: ["ctaUrl"], message: "Call buttons use the profile phone number" });
    if (post.ctaType !== "CALL" && !post.ctaUrl) ctx.addIssue({ code: "custom", path: ["ctaUrl"], message: "A link is required for this button" });
  });

export const replySchema = z.object({ text: z.string().trim().min(1).max(1000) });

export const reviewFilterSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  replied: z.enum(["yes", "no"]).optional(),
  search: z.string().trim().max(100).optional(),
});

export const reviewSettingsSchema = z
  .object({
    autoReplyEnabled: z.boolean(),
    replyBrain: z.string().trim().max(3000).nullable().optional(),
    mode: z.enum(["draft_only", "auto_4_5", "full_auto"]),
    delayMinS: z.number().int().min(60).max(86_400).default(300),
    delayMaxS: z.number().int().min(60).max(86_400).default(3600),
  })
  .refine((value) => value.delayMaxS >= value.delayMinS, { message: "The longest delay can't be shorter than the shortest", path: ["delayMaxS"] });

export const notificationSettingsSchema = z.object({
  emails: z.array(emailSchema).max(10).default([]),
  webhookUrl: z.string().url().startsWith("http").nullable().optional(),
  webhookKind: z.enum(["generic", "whatsapp", "telegram"]).default("generic"),
  webhookChatId: z.string().trim().max(100).nullable().optional(),
});

export const openaiSettingsSchema = z.object({
  apiKey: z.string().trim().min(20).max(300).optional(),
  visionModel: z.string().trim().min(1).max(100),
  inputPricePerM: z.number().min(0).max(1000).optional(),
  outputPricePerM: z.number().min(0).max(1000).optional(),
});

export const LIBRARY_LIMITS = {
  minBytes: 10 * 1024,
  maxBytes: 5 * 1024 * 1024,
  minDimension: 250,
  mimeTypes: ["image/jpeg", "image/png"],
} as const;

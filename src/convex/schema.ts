import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin", // admin global du site
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const OPTION_VALUES = ["LCE", "Latin", "Allemand", "Espagnol"] as const;
export const optionValidator = v.union(
  v.literal("LCE"),
  v.literal("Latin"),
  v.literal("Allemand"),
  v.literal("Espagnol"),
);
export type OptionValue = (typeof OPTION_VALUES)[number];

export const DAYS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;
export const dayValidator = v.union(
  ...DAYS.map((d) => v.literal(d)),
);
export type Day = (typeof DAYS)[number];

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // Champs applicatif Foudre
      isAdmin: v.optional(v.boolean()), // admin global du site
      isClassAdmin: v.optional(v.boolean()), // admin de sa classe
      classId: v.optional(v.id("classes")),
      option: v.optional(optionValidator),
      questionnaireDone: v.optional(v.boolean()),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Classes prédéfinies par les admins globaux
    classes: defineTable({
      name: v.string(), // ex: "3ème A"
      createdAt: v.number(),
    }).index("by_name", ["name"]),

    // Emploi du temps par classe
    timetableSlots: defineTable({
      classId: v.id("classes"),
      day: dayValidator,
      start: v.string(), // "HH:MM"
      end: v.string(), // "HH:MM"
      subject: v.string(),
      teacher: v.optional(v.string()),
      room: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_class", ["classId"]),

    // Fichiers de cours / devoirs rattachés à un créneau
    courseFiles: defineTable({
      slotId: v.id("timetableSlots"),
      title: v.string(),
      kind: v.union(v.literal("cours"), v.literal("devoir")),
      description: v.optional(v.string()),
      fileName: v.string(),
      fileType: v.string(),
      bytes: v.optional(v.number()),
      storageId: v.optional(v.id("_storage")),
      externalUrl: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_slot", ["slotId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;

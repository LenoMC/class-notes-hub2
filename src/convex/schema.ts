import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin", // administrateur global du site
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const OPTION_VALUES = [
  "LCE",
  "Latin",
  "Allemand",
  "Espagnol",
  "Sécurité Civile",
] as const;
export const optionValidator = v.union(
  v.literal("LCE"),
  v.literal("Latin"),
  v.literal("Allemand"),
  v.literal("Espagnol"),
  v.literal("Sécurité Civile"),
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
export const dayValidator = v.union(...DAYS.map((d) => v.literal(d)));
export type Day = (typeof DAYS)[number];

export const WEEK_TYPES = ["A", "B"] as const;
export const weekTypeValidator = v.union(
  v.literal("A"),
  v.literal("B"),
  v.literal("AB"), // cours toutes les semaines
);
export type WeekType = (typeof WEEK_TYPES)[number] | "AB";

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      firstName: v.optional(v.string()), // prénom
      lastName: v.optional(v.string()), // nom de famille
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // Champs applicatif Classheure
      isAdmin: v.optional(v.boolean()), // administrateur global du site
      isClassAdmin: v.optional(v.boolean()), // responsable (admin) de sa classe
      classId: v.optional(v.id("classes")),
      adminOfClassId: v.optional(v.id("classes")), // classe dont il est responsable
      options: v.optional(v.array(optionValidator)), // options choisies (1 à 4)
      group: v.optional(v.union(v.literal("G1"), v.literal("G2"))), // groupe de l'élève
      questionnaireDone: v.optional(v.boolean()),
      phone: v.optional(v.string()), // téléphone E.164 (+33...) pour les SMS admins
      discordId: v.optional(v.string()), // ID Discord pour les MPs du bot
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("by_class", ["classId"]),

    // Forum : questions posées par les élèves, réponses et votes
    forumThreads: defineTable({
      classId: v.id("classes"),
      authorId: v.id("users"),
      title: v.string(),
      body: v.string(),
      subject: v.optional(v.string()), // matière du cours concerné (facultatif)
      resolved: v.optional(v.boolean()),
      resolvedById: v.optional(v.id("users")), // qui a marqué résolu
      resolvedAt: v.optional(v.number()),
      answerCount: v.optional(v.number()), // dénormalisé pour trier sans calculer
      createdAt: v.number(),
    })
      .index("by_class", ["classId"])
      .index("by_class_created", ["classId", "createdAt"]),

    forumPosts: defineTable({
      threadId: v.id("forumThreads"),
      authorId: v.id("users"),
      body: v.string(),
      createdAt: v.number(),
    }).index("by_thread", ["threadId"]),

    // Un vote (upvote) par utilisateur et par question
    forumVotes: defineTable({
      threadId: v.id("forumThreads"),
      userId: v.id("users"),
    }).index("by_thread", ["threadId"]).index("by_thread_user", ["threadId", "userId"]),

    // Sondages créés par les admins globaux et responsables de classe
    polls: defineTable({
      classId: v.id("classes"),
      authorId: v.id("users"),
      question: v.string(),
      options: v.array(v.string()), // 2 à 6 choix
      closed: v.optional(v.boolean()),
      closedAt: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_class", ["classId"]),

    // Un vote par utilisateur et par sondage
    pollVotes: defineTable({
      pollId: v.id("polls"),
      userId: v.id("users"),
      choice: v.number(), // index de l'option choisie
    })
      .index("by_poll", ["pollId"])
      .index("by_poll_user", ["pollId", "userId"]),

    // Codes de réinitialisation de mot de passe envoyés par SMS (comptes téléphone)
    phoneResetCodes: defineTable({
      phone: v.string(), // numéro E.164 du compte concerné (+33...)
      code: v.string(), // code à 6 chiffres envoyé par SMS
      expiresAt: v.number(),
      resetToken: v.optional(v.string()), // jeton d'échange après validation du code
      tokenExpiresAt: v.optional(v.number()),
    })
      .index("by_phone", ["phone"])
      .index("by_token", ["resetToken"]),

    // Classes prédéfinies par les administrateurs globaux
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
      weekType: v.optional(weekTypeValidator), // A, B ou AB (défaut : AB)
      group: v.optional(v.union(v.literal("G1"), v.literal("G2"))), // créneau réservé à un groupe
      color: v.optional(v.string()), // couleur de la case (hex), sinon couleur de la matière
      cancelled: v.optional(v.boolean()), // cours annulé par un admin (permanent)
      cancellationReason: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_class", ["classId"]),

    // Exceptions ponctuelles : annulation ou remplacement pour UNE date
    // précise (le cours récurrent reste inchangé les autres semaines).
    slotExceptions: defineTable({
      slotId: v.id("timetableSlots"),
      date: v.string(), // "YYYY-MM-DD" du jour concerné (une seule fois)
      kind: v.union(v.literal("cancelled"), v.literal("replaced")),
      reason: v.optional(v.string()), // motif affiché (ex. "prof absent")
      // Cours de remplacement (si kind = "replaced") :
      replacementSubject: v.optional(v.string()),
      replacementTeacher: v.optional(v.string()),
      replacementRoom: v.optional(v.string()),
      createdBy: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_slot", ["slotId"])
      .index("by_date", ["date"]),

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

    // Vacances : arrêt de l'alternance A/B (pas de comptage pendant les périodes)
    holidays: defineTable({
      label: v.string(), // ex: "Vacances d'hiver"
      startDay: v.string(), // "YYYY-MM-DD" inclus
      endDay: v.string(), // "YYYY-MM-DD" inclus
      createdAt: v.number(),
    }),

  // Ancre de l'alternance A/B : la semaine du startDay est une semaine A
  weekAnchor: defineTable({
    startDay: v.string(), // lundi "YYYY-MM-DD" d'une semaine A
  }),

  // Chat direct de classe
  chatMessages: defineTable({
    classId: v.id("classes"),
    authorId: v.id("users"),
    text: v.string(),
    ficheId: v.optional(v.id("courseFiles")), // fiche jointe au message
    imageId: v.optional(v.id("_storage")), // image jointe au message
    createdAt: v.number(),
  }).index("by_class", ["classId"]),

  // Demandes d'accès : capture d'écran de preuve (Arsene76) à approuver
  // par un administrateur global avant l'accès au questionnaire.
  accessRequests: defineTable({
    userId: v.id("users"),
    userEmail: v.string(),
    userName: v.optional(v.string()),
    storageId: v.id("_storage"), // capture d'écran de preuve
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    reviewerId: v.optional(v.id("users")),
    reviewNote: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_status", ["status"]).index("by_user", ["userId"]),
},
  {
    schemaValidation: false,
  },
);

export default schema;

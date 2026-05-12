import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgEnum,
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'photographer', 'client']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    passwordHash: text('password_hash'),
    role: userRoleEnum('role').notNull(),
    oauthProvider: varchar('oauth_provider', { length: 32 }),
    oauthProviderId: varchar('oauth_provider_id', { length: 255 }),
    emailVerified: boolean('email_verified').notNull().default(false),
    emailVerificationToken: text('email_verification_token'),
    emailVerificationTokenExpiresAt: timestamp('email_verification_token_expires_at', {
      withTimezone: true,
    }),
    pendingEmail: varchar('pending_email', { length: 320 }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    oauthIdx: uniqueIndex('users_oauth_idx').on(t.oauthProvider, t.oauthProviderId),
  }),
);

export const libraries = pgTable(
  'libraries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    shootDate: timestamp('shoot_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    photographerIdx: index('libraries_photographer_idx').on(t.photographerId),
  }),
);

export const libraryClients = pgTable(
  'library_clients',
  {
    libraryId: uuid('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.libraryId, t.clientId] }),
    clientIdx: index('library_clients_client_idx').on(t.clientId),
  }),
);

export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    libraryId: uuid('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    originalPath: text('original_path').notNull(),
    thumbnailPath: text('thumbnail_path').notNull(),
    width: integer('width'),
    height: integer('height'),
    byteSize: integer('byte_size'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    libIdx: index('photos_library_idx').on(t.libraryId),
  }),
);

export const stars = pgTable(
  'stars',
  {
    photoId: uuid('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: integer('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.photoId, t.userId] }),
    valueCheck: check('stars_value_range', sql`${t.value} BETWEEN 0 AND 5`),
    userIdx: index('stars_user_idx').on(t.userId),
  }),
);

export const starHistory = pgTable(
  'star_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    photoId: uuid('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: integer('value').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    photoUserIdx: index('star_history_photo_user_idx').on(t.photoId, t.userId),
  }),
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 8 }).notNull(),
    email: varchar('email', { length: 320 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    consumedByUserId: uuid('consumed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    codeIdx: uniqueIndex('invitations_code_idx').on(t.code),
    emailIdx: index('invitations_email_idx').on(t.email),
  }),
);

export const libraryInvitations = pgTable(
  'library_invitations',
  {
    libraryId: uuid('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    invitationId: uuid('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.libraryId, t.invitationId] }),
    invitationIdx: index('library_invitations_invitation_idx').on(t.invitationId),
  }),
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('password_reset_tokens_token_idx').on(t.token),
    userIdx: index('password_reset_tokens_user_idx').on(t.userId),
  }),
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const usersRelations = relations(users, ({ many }) => ({
  ownedLibraries: many(libraries),
  sharedLibraries: many(libraryClients),
  stars: many(stars),
  starHistory: many(starHistory),
}));

export const librariesRelations = relations(libraries, ({ one, many }) => ({
  photographer: one(users, {
    fields: [libraries.photographerId],
    references: [users.id],
  }),
  clients: many(libraryClients),
  photos: many(photos),
}));

export const libraryClientsRelations = relations(libraryClients, ({ one }) => ({
  library: one(libraries, {
    fields: [libraryClients.libraryId],
    references: [libraries.id],
  }),
  client: one(users, {
    fields: [libraryClients.clientId],
    references: [users.id],
  }),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  library: one(libraries, {
    fields: [photos.libraryId],
    references: [libraries.id],
  }),
  stars: many(stars),
  history: many(starHistory),
}));

export const starsRelations = relations(stars, ({ one }) => ({
  photo: one(photos, { fields: [stars.photoId], references: [photos.id] }),
  user: one(users, { fields: [stars.userId], references: [users.id] }),
}));

export const starHistoryRelations = relations(starHistory, ({ one }) => ({
  photo: one(photos, { fields: [starHistory.photoId], references: [photos.id] }),
  user: one(users, { fields: [starHistory.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Library = typeof libraries.$inferSelect;
export type NewLibrary = typeof libraries.$inferInsert;
export type LibraryClient = typeof libraryClients.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type Star = typeof stars.$inferSelect;
export type NewStar = typeof stars.$inferInsert;
export type StarHistoryEntry = typeof starHistory.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type LibraryInvitation = typeof libraryInvitations.$inferSelect;

export const invitationsRelations = relations(invitations, ({ one, many }) => ({
  invitedBy: one(users, {
    fields: [invitations.invitedByUserId],
    references: [users.id],
    relationName: 'invitationsCreated',
  }),
  consumedBy: one(users, {
    fields: [invitations.consumedByUserId],
    references: [users.id],
    relationName: 'invitationsConsumed',
  }),
  libraryInvitations: many(libraryInvitations),
}));

export const libraryInvitationsRelations = relations(libraryInvitations, ({ one }) => ({
  library: one(libraries, {
    fields: [libraryInvitations.libraryId],
    references: [libraries.id],
  }),
  invitation: one(invitations, {
    fields: [libraryInvitations.invitationId],
    references: [invitations.id],
  }),
}));
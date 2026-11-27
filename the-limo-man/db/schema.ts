import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const subscribers = sqliteTable('subscribers', {
  id: text('id').primaryKey(), email: text('email').notNull().unique(),
  status: text('status').notNull().default('subscribed'), source: text('source').notNull(),
  consentText: text('consent_text').notNull(), subscribedAt: integer('subscribed_at').notNull(),
  consentAt: integer('consent_at').notNull(), updatedAt: integer('updated_at').notNull(),
  signupCount: integer('signup_count').notNull().default(1),
}, table => [index('subscribers_date_idx').on(table.subscribedAt)]);
export const signupLimits = sqliteTable('signup_limits', {
  key: text('key').primaryKey(), bucket: integer('bucket').notNull(), count: integer('count').notNull().default(1),
});

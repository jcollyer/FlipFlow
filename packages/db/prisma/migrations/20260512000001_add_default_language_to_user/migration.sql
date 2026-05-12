-- Add a default language preference to User.
-- When set, new decks created by the user will have their backLanguage
-- pre-populated with this value. Null means no default is configured.
ALTER TABLE "User" ADD COLUMN "defaultLanguage" TEXT;

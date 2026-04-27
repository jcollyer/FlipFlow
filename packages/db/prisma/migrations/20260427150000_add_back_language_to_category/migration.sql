-- Add a nullable BCP-47 language tag to Category. Drives the Google Cloud
-- Text-to-Speech voice for the back of cards in the deck. Null means no
-- language is configured (the audio button is hidden in the UI).
ALTER TABLE "Category" ADD COLUMN "backLanguage" TEXT;

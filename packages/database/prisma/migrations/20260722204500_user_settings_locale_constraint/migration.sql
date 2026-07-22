-- Keep persisted locale values aligned with the API's explicitly supported set.
ALTER TABLE "UserSettings"
ADD CONSTRAINT "UserSettings_locale_check"
CHECK ("locale" IN ('de-DE', 'en-US'));

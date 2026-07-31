ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "evidence_photos" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "publish_each_activity_enabled" boolean DEFAULT false NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_evidence_photos_check') THEN
    ALTER TABLE "activities" ADD CONSTRAINT "activities_evidence_photos_check"
      CHECK (jsonb_typeof("evidence_photos") = 'array' AND jsonb_array_length("evidence_photos") <= 2);
  END IF;
END $$;

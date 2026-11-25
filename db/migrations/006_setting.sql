-- Sixth migration: where a story is set (owner request, 2026-11-25).
--
-- 'earth'           the story takes place on Earth (including a hidden or fantastical layer of it)
-- 'fictional_world' the story takes place in a completely fictional world or universe
-- 'unknown'         not classified yet (the default; the importer never guesses)
--
-- A classification is an editorial claim like every other seed field: the rows stay
-- needs_review, and a franchise the owner has not judged stays 'unknown'.

ALTER TABLE works ADD COLUMN setting text NOT NULL DEFAULT 'unknown';
ALTER TABLE works ADD CONSTRAINT works_setting_check CHECK (setting IN ('unknown', 'earth', 'fictional_world'));

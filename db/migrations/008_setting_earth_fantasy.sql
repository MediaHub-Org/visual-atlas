-- Eighth migration: a third setting (owner request, 2026-11-25).
--
-- 'earth_fantasy' is a story set on Earth with fantasy, supernatural or superpowered elements (magic hidden
-- inside the real world, superheroes, ghosts, living toys). 'earth' stays for realistic stories and
-- 'fictional_world' for a completely fictional world or universe.

ALTER TABLE works DROP CONSTRAINT works_setting_check;
ALTER TABLE works ADD CONSTRAINT works_setting_check CHECK (setting IN ('unknown', 'earth', 'earth_fantasy', 'fictional_world'));

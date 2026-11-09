-- Move the primary character details into characters and remove character_info.
BEGIN;

ALTER TABLE characters RENAME COLUMN name TO character_name;
ALTER TABLE characters
    ADD COLUMN character_clan TEXT,
    ADD COLUMN character_height NUMERIC(5, 2)
        CHECK (character_height IS NULL OR character_height > 0),
    ADD COLUMN character_patent TEXT;

COMMENT ON COLUMN characters.character_height IS 'Character height in centimeters.';
COMMENT ON COLUMN characters.attributes IS 'System-specific character attributes stored as a JSON object.';

DROP TABLE character_info;

COMMIT;

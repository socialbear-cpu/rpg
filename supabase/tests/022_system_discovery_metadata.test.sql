BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
    ('b1000000-0000-4000-8000-000000000001', 'metadata-owner@example.test', '{}'),
    ('b1000000-0000-4000-8000-000000000002', 'metadata-player@example.test', '{}'),
    ('b1000000-0000-4000-8000-000000000003', 'metadata-admin@example.test', '{}');
INSERT INTO private.platform_admins (user_id)
VALUES ('b1000000-0000-4000-8000-000000000003');

INSERT INTO public.game_systems (id, slug, name, owner_user_id)
VALUES ('b2000000-0000-4000-8000-000000000001', 'legacy-metadata-system', 'Legacy Metadata System', 'b1000000-0000-4000-8000-000000000001');

SELECT is(
    (SELECT play_mode FROM public.game_systems WHERE id = 'b2000000-0000-4000-8000-000000000001'),
    'text',
    'legacy systems receive the compatible text modality'
);
SELECT is(
    (SELECT cardinality(tags) FROM public.game_systems WHERE id = 'b2000000-0000-4000-8000-000000000001'),
    0,
    'legacy systems receive no tags by default'
);
SELECT ok(
    EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'game-system-covers' AND public AND file_size_limit = 5242880),
    'creates a public, size-limited cover image bucket'
);
SELECT ok(
    (SELECT count(*) >= 20 FROM public.game_system_tag_catalog WHERE is_active),
    'seeds the platform tag catalogue'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000001"}', true);

SELECT is(
    public.create_game_system_with_metadata(
        'Metadata Created System',
        NULL,
        '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[]}]}'::JSONB,
        'voice',
        ARRAY['fantasia']
    )->>'status',
    'created',
    'creation saves the selected modality and tags with the sheet'
);
SELECT is(
    (SELECT play_mode FROM public.game_systems WHERE name = 'Metadata Created System'),
    'voice',
    'new system stores the selected modality'
);
SELECT is(
    (SELECT tags FROM public.game_systems WHERE name = 'Metadata Created System'),
    ARRAY['fantasia'],
    'new system stores the selected tags'
);
SELECT throws_ok(
    $$SELECT public.create_game_system_with_metadata(
        'Invalid Tag System', NULL,
        '{"version":1,"steps":[{"key":"step_1","label":"Etapa 1","position":0,"components":[]}]}'::JSONB,
        'text', ARRAY['invented-tag']
    )$$,
    '22023', 'Invalid game system tags',
    'creation rejects tags outside the platform catalogue'
);
SELECT throws_ok(
    $$INSERT INTO public.game_systems (id, slug, name, tags)
      VALUES ('b2000000-0000-4000-8000-000000000002', 'invalid-tag-system', 'Invalid Tag System', ARRAY['invented-tag'])$$,
    '22023', 'Invalid game system tags',
    'database rejects unlisted tags on direct system inserts'
);

SELECT is(
    public.update_game_system_profile(
        'b2000000-0000-4000-8000-000000000001',
        'Legacy Metadata System',
        NULL,
        TRUE,
        NULL,
        'voice',
        ARRAY['fantasia', 'medieval'],
        'b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001.webp',
        25,
        65
    )->>'status',
    'updated',
    'owner can update system discovery metadata'
);
SELECT is(
    (SELECT play_mode FROM public.game_systems WHERE id = 'b2000000-0000-4000-8000-000000000001'),
    'voice',
    'persists the selected voice modality'
);
SELECT is(
    (SELECT tags FROM public.game_systems WHERE id = 'b2000000-0000-4000-8000-000000000001'),
    ARRAY['fantasia', 'medieval'],
    'persists selected catalogue tags'
);
SELECT is(
    (SELECT cover_focus_x::INTEGER || ',' || cover_focus_y::INTEGER FROM public.game_systems WHERE id = 'b2000000-0000-4000-8000-000000000001'),
    '25,65',
    'persists image focus coordinates'
);
SELECT ok(
    private._can_manage_game_system_cover('b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001.webp'),
    'system owner can manage cover files in their system folder'
);
SELECT ok(
    NOT private._can_manage_game_system_cover('invalid/path.webp'),
    'rejects malformed cover object paths'
);
SELECT is(
    public.update_game_system_profile(
        'b2000000-0000-4000-8000-000000000001', 'Legacy Metadata System', NULL, TRUE, NULL,
        'text', ARRAY['invented-tag'], NULL, 50, 50
    )->>'status',
    'invalid_details',
    'rejects tags outside the platform catalogue'
);
SELECT throws_ok(
    $$UPDATE public.game_systems SET play_mode = 'voice' WHERE id = 'b2000000-0000-4000-8000-000000000001'$$,
    '42501', NULL,
    'prevents direct client writes to protected metadata columns'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000003"}', true);
SELECT is(
    public.update_game_system_profile(
        'b2000000-0000-4000-8000-000000000001',
        'Admin Updated System',
        NULL,
        TRUE,
        NULL,
        'text',
        ARRAY[]::TEXT[],
        NULL,
        50,
        50
    )->>'status',
    'updated',
    'platform admin can update system discovery metadata'
);
SELECT ok(
    private._can_manage_game_system_cover('b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001.webp'),
    'platform admin can manage system cover files'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000002"}', true);
SELECT is(
    public.update_game_system_profile(
        'b2000000-0000-4000-8000-000000000001',
        'Unauthorized Change',
        NULL,
        TRUE,
        NULL,
        'text',
        ARRAY[]::TEXT[],
        NULL,
        50,
        50
    )->>'status',
    'not_owner',
    'non-owner cannot update system discovery metadata'
);
SELECT ok(
    NOT private._can_manage_game_system_cover('b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001.webp'),
    'non-owner cannot manage cover files'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

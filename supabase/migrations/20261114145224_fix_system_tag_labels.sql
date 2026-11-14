BEGIN;

UPDATE public.game_system_tag_catalog
SET label = U&'Fic\00e7\00e3o cient\00edfica'
WHERE slug = 'ficcao-cientifica';

UPDATE public.game_system_tag_catalog
SET label = U&'Mist\00e9rio'
WHERE slug = 'misterio';

UPDATE public.game_system_tag_catalog
SET label = U&'Investiga\00e7\00e3o'
WHERE slug = 'investigacao';

UPDATE public.game_system_tag_catalog
SET label = U&'P\00f3s-apocal\00edptico'
WHERE slug = 'pos-apocaliptico';

UPDATE public.game_system_tag_catalog
SET label = U&'Com\00e9dia'
WHERE slug = 'comedia';

UPDATE public.game_system_tag_catalog
SET label = U&'A\00e7\00e3o'
WHERE slug = 'acao';

UPDATE public.game_system_tag_catalog
SET label = U&'Sobreviv\00eancia'
WHERE slug = 'sobrevivencia';

COMMIT;

BEGIN;

ALTER TABLE public.game_system_lobby_settings
    ALTER COLUMN welcome_title SET DEFAULT 'Bem-vinda à campanha',
    ALTER COLUMN welcome_message SET DEFAULT 'Veja as salas, conversas e próximos encontros do sistema.';

COMMIT;

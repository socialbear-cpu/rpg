BEGIN;

ALTER TABLE public.chat_rooms
    ADD CONSTRAINT chat_rooms_name_length_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80) NOT VALID;

CREATE POLICY chat_rooms_create_campaign_hosts
    ON public.chat_rooms FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns AS campaign
            WHERE campaign.id = chat_rooms.campaign_id
              AND private.can_access_game_system(campaign.game_system_id)
              AND (
                  campaign.owner_user_id = (SELECT auth.uid())
                  OR private.has_system_role(campaign.game_system_id, ARRAY['owner'])
                  OR EXISTS (
                      SELECT 1 FROM public.campaign_members AS member
                      WHERE member.campaign_id = campaign.id
                        AND member.role = 'game_master'
                        AND private.owns_character(member.character_id)
                  )
              )
        )
    );

COMMIT;

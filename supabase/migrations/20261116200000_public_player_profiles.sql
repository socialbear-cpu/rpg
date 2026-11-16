CREATE TABLE public.profile_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX profile_comments_profile_created_idx ON public.profile_comments(profile_user_id, created_at DESC);
ALTER TABLE public.profile_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_comments FROM PUBLIC, anon, authenticated;

CREATE TABLE public.direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sender_user_id <> recipient_user_id)
);
CREATE INDEX direct_messages_conversation_idx ON public.direct_messages(sender_user_id, recipient_user_id, created_at DESC);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_messages FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_social_profile(p_username TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_profile public.user_profiles%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  SELECT profile.* INTO v_profile FROM public.user_profiles AS profile
  JOIN public.users AS account ON account.id=profile.user_id AND account.is_active
  WHERE profile.username = lower(p_username);
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  RETURN jsonb_build_object('status','ok','profile',jsonb_build_object(
    'user_id',v_profile.user_id,'username',v_profile.username,'display_name',v_profile.display_name,
    'avatar_url',v_profile.avatar_url,'banner_url',v_profile.banner_url,'bio',v_profile.bio,
    'status',v_profile.status,'interests',to_jsonb(v_profile.interests)),
    'systems', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description))
      FROM public.game_system_memberships m JOIN public.game_systems s ON s.id=m.game_system_id
      WHERE m.user_id=v_profile.user_id AND s.is_public IS TRUE AND s.is_active IS TRUE), '[]'::jsonb));
END; $function$;
REVOKE ALL ON FUNCTION public.get_social_profile(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_profile(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_profile_comments(p_username TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_owner UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  SELECT user_id INTO v_owner FROM public.user_profiles WHERE username=lower(p_username);
  IF v_owner IS NULL THEN RETURN jsonb_build_object('status','not_found'); END IF;
  RETURN jsonb_build_object('status','ok','comments',COALESCE((SELECT jsonb_agg(x) FROM (
    SELECT c.id,c.content,c.created_at,a.user_id AS author_user_id,a.username AS author_username,a.display_name AS author_display_name,a.avatar_url AS author_avatar_url
    FROM public.profile_comments c JOIN public.user_profiles a ON a.user_id=c.author_user_id
    WHERE c.profile_user_id=v_owner ORDER BY c.created_at DESC LIMIT 50) x),'[]'::jsonb));
END; $function$;
CREATE OR REPLACE FUNCTION public.create_profile_comment(p_username TEXT,p_content TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_owner UUID; v_id UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  SELECT user_id INTO v_owner FROM public.user_profiles WHERE username=lower(p_username);
  IF v_owner IS NULL THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF v_owner=(SELECT auth.uid()) THEN RETURN jsonb_build_object('status','self_wall'); END IF;
  IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 500 THEN RETURN jsonb_build_object('status','invalid_content'); END IF;
  INSERT INTO public.profile_comments(profile_user_id,author_user_id,content) VALUES(v_owner,(SELECT auth.uid()),btrim(p_content)) RETURNING id INTO v_id;
  RETURN jsonb_build_object('status','created','id',v_id);
END; $function$;
CREATE OR REPLACE FUNCTION public.delete_profile_comment(p_comment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_row public.profile_comments%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  SELECT * INTO v_row FROM public.profile_comments WHERE id=p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF v_row.author_user_id<>(SELECT auth.uid()) AND v_row.profile_user_id<>(SELECT auth.uid()) THEN RETURN jsonb_build_object('status','forbidden'); END IF;
  DELETE FROM public.profile_comments WHERE id=p_comment_id;
  RETURN jsonb_build_object('status','deleted');
END; $function$;
CREATE OR REPLACE FUNCTION public.get_direct_messages(p_other_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 RETURN jsonb_build_object('status','ok','messages',COALESCE((SELECT jsonb_agg(x) FROM (
   SELECT id,sender_user_id,recipient_user_id,content,created_at FROM public.direct_messages
   WHERE (sender_user_id=(SELECT auth.uid()) AND recipient_user_id=p_other_user_id) OR (sender_user_id=p_other_user_id AND recipient_user_id=(SELECT auth.uid()))
   ORDER BY created_at DESC LIMIT 50) x),'[]'::jsonb));
END; $function$;
CREATE OR REPLACE FUNCTION public.send_direct_message(p_recipient_user_id UUID,p_content TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_id UUID;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_recipient_user_id=(SELECT auth.uid()) THEN RETURN jsonb_build_object('status','self_message'); END IF;
 IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 2000 THEN RETURN jsonb_build_object('status','invalid_content'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE user_id=p_recipient_user_id) THEN RETURN jsonb_build_object('status','not_found'); END IF;
 INSERT INTO public.direct_messages(sender_user_id,recipient_user_id,content) VALUES((SELECT auth.uid()),p_recipient_user_id,btrim(p_content)) RETURNING id INTO v_id;
 RETURN jsonb_build_object('status','sent','id',v_id);
END; $function$;
REVOKE ALL ON FUNCTION public.list_profile_comments(TEXT),public.create_profile_comment(TEXT,TEXT),public.delete_profile_comment(UUID),public.get_direct_messages(UUID),public.send_direct_message(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_profile_comments(TEXT),public.create_profile_comment(TEXT,TEXT),public.delete_profile_comment(UUID),public.get_direct_messages(UUID),public.send_direct_message(UUID,TEXT) TO authenticated;

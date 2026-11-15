-- student_groups + student_group_members: org-scoped, soft-deleted, many-to-many. Written only by SECURITY DEFINER RPCs (20261115000200/300). #1776

CREATE TABLE public.student_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  description     text CHECK (description IS NULL OR char_length(description) <= 500),
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX student_groups_active_name_uniq
  ON public.student_groups (organization_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_student_groups_organization_id ON public.student_groups (organization_id);

CREATE TABLE public.student_group_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  added_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX student_group_members_active_uniq
  ON public.student_group_members (group_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_student_group_members_user_id ON public.student_group_members (user_id);
CREATE INDEX idx_student_group_members_organization_id
  ON public.student_group_members (organization_id);

ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_group_members FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_read_org_student_groups ON public.student_groups
  FOR SELECT TO authenticated
  USING (
    (SELECT is_admin())
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY admin_read_org_student_group_members ON public.student_group_members
  FOR SELECT TO authenticated
  USING (
    (SELECT is_admin())
    AND organization_id IN (
      SELECT u.organization_id FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- GDPR self-export: a student reads their own active memberships and the groups they belong to.
CREATE POLICY user_read_own_student_group_members ON public.student_group_members
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND deleted_at IS NULL);

CREATE POLICY user_read_own_student_groups ON public.student_groups
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.student_group_members m
      WHERE m.group_id = student_groups.id
        AND m.user_id = (SELECT auth.uid())
        AND m.deleted_at IS NULL
    )
  );

CREATE POLICY student_groups_select_active_caller ON public.student_groups
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY student_group_members_select_active_caller ON public.student_group_members
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));

GRANT SELECT ON public.student_groups TO authenticated;
GRANT SELECT ON public.student_group_members TO authenticated;

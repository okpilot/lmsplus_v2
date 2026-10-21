-- question_comments_select requires the caller's live users row, like its insert/delete siblings. #1558

ALTER POLICY "question_comments_select" ON public.question_comments
  USING (
    ((deleted_at IS NULL)
    AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.deleted_at IS NULL)))))
  );

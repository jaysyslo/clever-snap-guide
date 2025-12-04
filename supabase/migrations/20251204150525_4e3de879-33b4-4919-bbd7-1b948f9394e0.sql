-- Add UPDATE policy for study_guides
CREATE POLICY "Users can update own study guides"
ON public.study_guides
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
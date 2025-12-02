-- Allow users to update their own question history (for saving progress)
CREATE POLICY "Users can update own questions" 
ON public.question_history 
FOR UPDATE 
USING (auth.uid() = user_id);
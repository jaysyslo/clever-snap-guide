import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch user's question history including solution_data
    const { data: questions, error } = await supabase
      .from('question_history')
      .select('problem_text, solution_mode, solution_data, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20); // Limit to recent problems to avoid token limits

    if (error) throw error;

    if (!questions || questions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No question history found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare context from question history - extract solution content
    const historyContext = questions.map((q, idx) => {
      let content = `Problem ${idx + 1} (Mode: ${q.solution_mode}):`;
      let solutionText = '';
      
      // Use solution_data if available (contains actual solution text)
      if (q.solution_data && typeof q.solution_data === 'object') {
        const solutionData = q.solution_data as { solution?: string; rawSolution?: string; status?: string };
        
        // Skip entries that are still processing
        if (solutionData.status === 'processing') {
          console.log(`Skipping question ${idx + 1} - still processing`);
          return '';
        }
        
        solutionText = solutionData.rawSolution || solutionData.solution || '';
      }
      
      // Fall back to problem_text if no solution content
      if (!solutionText && q.problem_text) {
        solutionText = q.problem_text;
      }
      
      if (solutionText) {
        // Truncate very long solutions to save tokens
        const truncated = solutionText.length > 2000 ? solutionText.substring(0, 2000) + '...' : solutionText;
        content += `\n${truncated}`;
        console.log(`Question ${idx + 1}: extracted ${truncated.length} chars`);
      } else {
        console.log(`Question ${idx + 1}: no content found`);
        return '';
      }
      
      return content;
    }).filter(c => c.length > 50).join('\n\n---\n\n'); // Only include entries with actual content

    console.log(`Found ${questions.length} questions, usable context length: ${historyContext.length}`);

    if (!historyContext || historyContext.length < 100) {
      return new Response(
        JSON.stringify({ error: 'Not enough problem data to generate a study guide. Please solve more problems first.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an expert math tutor creating a highly personalized study guide. Analyze the provided math solutions from the student's history. Identify the mathematical concepts involved, patterns in the types of problems solved, and areas that could benefit from more practice. Use LaTeX notation (e.g., $x^2$) for any mathematical expressions.

Your response MUST be formatted with clear headings for:
1. **Summary of Topics Covered** - Brief overview of the mathematical topics the student has been working on
2. **Key Concepts to Review** - Important formulas, theorems, and concepts the student should master
3. **Study Recommendations** - Specific advice for improvement
4. **Practice Problems** - For EACH practice problem, you MUST include:
   - The problem statement
   - **Final Answer:** The correct answer clearly stated
   - <details><summary>Show Full Solution</summary>
   
   [Complete step-by-step solution with all work shown]
   
   </details>

IMPORTANT: Each practice problem must have both the final answer displayed prominently AND a collapsible section containing the full step-by-step solution. Use the HTML <details> and <summary> tags exactly as shown above for the collapsible solutions.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Generate a personalized study guide based on this question history:\n\n${historyContext}\n\nTotal questions: ${questions.length}`
          }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI API error:', error);
      throw new Error(`AI API error: ${error}`);
    }

    const data = await response.json();
    const studyGuide = data.choices[0].message.content;

    console.log('Study guide generated successfully');

    return new Response(
      JSON.stringify({ studyGuide }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

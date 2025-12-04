import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// ADDED: Import Supabase client
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
    const { imageUrl, mode } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    // Parse the imageUrl to extract bucket name and file path
    // URL format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
    const urlPattern = /\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)/;
    const match = imageUrl.match(urlPattern);
    
    if (!match) {
      throw new Error('Invalid image URL format');
    }
    
    const bucketName = match[1];
    const filePath = match[2];
    
    console.log('Bucket:', bucketName, 'Path:', filePath);
    console.log('Mode:', mode);

    // Initialize Supabase Admin client with Service Role Key
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the private file using the Service Role Key
    const { data: fileData, error: storageError } = await supabaseAdmin
        .storage
        .from(bucketName)
        .download(filePath);
    
    if (storageError) {
        throw new Error(`Supabase Storage Error: ${storageError.message}`);
    }
    
    if (!fileData) {
        throw new Error('Supabase Storage returned no file data.');
    }

    // Convert the Blob to ArrayBuffer
    const imageBuffer = await fileData.arrayBuffer();

    // Correctly convert ArrayBuffer to a Base64 string
    const uint8Array = new Uint8Array(imageBuffer);
    // Convert Uint8Array to a binary string before btoa()
    const binaryString = uint8Array.reduce(
        (acc, byte) => acc + String.fromCharCode(byte), 
        ''
    );
    const base64Image = btoa(binaryString);

    // TEMPORARY: Hardcode mimeType since Supabase download doesn't easily return it
    // NOTE: If this causes issues, you must pass the file's mime type from the client.
    const mimeType = 'image/png'; 
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    console.log('Image converted to base64, size:', base64Image.length);

    let systemPrompt = '';

    if (mode === 'similar') {
      systemPrompt = "You are a math tutor. Analyze the math problem in the image and create a SIMILAR (not identical) problem with a complete step-by-step solution. Format your response as a clear, educational walkthrough with numbered steps.";
    } else if (mode === 'step_by_step') {
      systemPrompt = `You are a patient math tutor. Analyze the EXACT problem in the image and break it down into 5-8 SMALL, granular steps. Each step should be a single operation or concept.

IMPORTANT: Break the problem into MORE steps than you think necessary. A simple algebra problem should have 5+ steps. A calculus problem should have 6-8 steps.

For EACH step, provide:
1) A clear instruction/question for ONE small task
2) A COMPREHENSIVE hint that includes:
   - The relevant formula, theorem, or rule (in LaTeX notation)
   - WHY this formula/technique applies here
   - Step-by-step guidance on how to apply it
   - Common mistakes to watch out for
   Use LaTeX for all math: inline math with $...$ and display math with $$...$$
3) A SHORT, simple answer (just the value/number/expression - no explanations!)

HINT EXAMPLES (these should be detailed!):
- "Use the quadratic formula: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$ where $a$ is the coefficient of $x^2$, $b$ is the coefficient of $x$, and $c$ is the constant term. First identify these values from your equation. Common mistake: forgetting the negative sign in front of $b$."
- "Apply the power rule for derivatives: $$\\frac{d}{dx}(x^n) = nx^{n-1}$$ Multiply the exponent by the coefficient, then reduce the exponent by 1. For example, $\\frac{d}{dx}(3x^4) = 12x^3$."
- "Use the Pythagorean theorem: $$a^2 + b^2 = c^2$$ where $c$ is the hypotenuse (longest side, opposite the right angle). Substitute the known values and solve for the unknown."
- "To factor a quadratic $ax^2 + bx + c$, find two numbers that multiply to give $ac$ and add to give $b$. Then rewrite the middle term and factor by grouping."

STEP BREAKDOWN EXAMPLE for "Solve 2x + 5 = 13":
Step 1: Identify what operation to undo first | Hint: Look at the left side. We have $2x + 5$. To isolate $x$, we work backwards using inverse operations. Addition is undone by subtraction. What should we subtract from both sides? | Answer: 5
Step 2: Subtract 5 from both sides | Hint: The subtraction property of equality states that subtracting the same value from both sides keeps the equation balanced: $2x + 5 - 5 = 13 - 5$. Simplify both sides. | Answer: 2x = 8
Step 3: Identify the next operation to undo | Hint: Now we have $2x = 8$. The $x$ is being multiplied by 2. Multiplication is undone by division. What should we divide both sides by? | Answer: 2
Step 4: Divide both sides by 2 | Hint: The division property of equality: $\\frac{2x}{2} = \\frac{8}{2}$. This isolates $x$. | Answer: x = 4
Step 5: Verify your answer | Hint: Substitute $x = 4$ back into the original equation: $2(4) + 5 = ?$. Does it equal 13? | Answer: yes

CRITICAL: The Answer MUST be SHORT and simple so a student can type it exactly. Examples of good answers: "3", "x = 5", "2x + 1", "yes", "no", "8", "x = 4"
Bad answers: "The answer is 3 because..." or "We get x = 4 by dividing"

Format EXACTLY as:
Step 1: [instruction] | Hint: [comprehensive hint with formulas in LaTeX] | Answer: [short answer]
Step 2: [instruction] | Hint: [comprehensive hint with formulas in LaTeX] | Answer: [short answer]
etc.`;
    }

    console.log('Calling AI with mode:', mode);
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
            content: [
              { type: 'text', text: 'Please analyze this math problem and provide the solution in the requested format.' },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
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
    const solution = data.choices[0].message.content;

    console.log('AI Response:', solution);

    // Generate topic tags for the problem
    let tags: string[] = [];
    try {
      const tagsResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { 
              role: 'system', 
              content: 'You are a math topic classifier. Given a math problem solution, identify 1-3 main mathematical topics/concepts covered. Return ONLY a comma-separated list of short topic names (2-3 words max each). Examples: "Quadratic Equations", "Derivatives", "Trigonometry", "Linear Algebra", "Fractions", "Geometry". Return nothing else.' 
            },
            { 
              role: 'user', 
              content: `Identify the math topics in this solution:\n\n${solution.substring(0, 1000)}`
            }
          ],
        }),
      });

      if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json();
        const rawTags = tagsData.choices[0].message.content.trim();
        tags = rawTags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0 && t.length < 30).slice(0, 3);
        console.log('Generated tags:', tags);
      }
    } catch (tagError) {
      console.error('Error generating tags:', tagError);
    }

    return new Response(
      JSON.stringify({ solution, mode, tags }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // ... (omitted code)

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.name : 'Unknown', error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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
      systemPrompt = `You are a math tutor. Analyze the EXACT problem in the image and break it down into 3-4 clear steps.

For EACH step, provide:
1) A brief instruction/question for that step
2) A helpful hint  
3) A SHORT, simple answer (just the value/number/expression - no explanations!)

CRITICAL: The Answer MUST be SHORT and simple so a student can type it exactly. Examples of good answers: "3", "x = 5", "2x + 1", "yes", "no", "linearly independent", "42"
Bad answers: "The answer is 3 because..." or "Each vector has 3 components"

Format EXACTLY as:
Step 1: [instruction] | Hint: [hint] | Answer: [short answer]
Step 2: [instruction] | Hint: [hint] | Answer: [short answer]
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

    return new Response(
      JSON.stringify({ solution, mode }),
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

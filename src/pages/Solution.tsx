import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, AlertCircle, Lightbulb, CheckCircle, ImageIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Step {
  instruction: string;
  hint: string;
  answer: string;
}

const Solution = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { imageUrl, mode, cachedSolution, startStep, completedSteps: initialCompletedSteps, viewSummary } = location.state || {};
  const [loading, setLoading] = useState(true);
  const [solution, setSolution] = useState<string>("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentStep, setCurrentStep] = useState(startStep || 0);
  const [completedSteps, setCompletedSteps] = useState<number>(initialCompletedSteps || 0);
  const [userAnswer, setUserAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [attemptedWrong, setAttemptedWrong] = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [signedImageUrl, setSignedImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showingSummary, setShowingSummary] = useState(viewSummary || false);

  useEffect(() => {
    if (!imageUrl || !mode) {
      navigate("/");
      return;
    }
    
    // Use cached solution if available
    if (cachedSolution) {
      if (mode === 'step_by_step') {
        const parsedSteps = parseSteps(cachedSolution);
        setSteps(parsedSteps);
        // If viewing summary, set currentStep to completed steps count
        if (viewSummary && initialCompletedSteps !== undefined) {
          setCurrentStep(initialCompletedSteps);
        }
      } else {
        setSolution(cachedSolution);
      }
      setLoading(false);
    } else {
      generateSolution();
    }
    getSignedImageUrl();
  }, [imageUrl, mode, cachedSolution]);

  const getSignedImageUrl = async () => {
    try {
      // Parse the storage URL to get bucket and path
      const urlPattern = /\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)/;
      const match = imageUrl.match(urlPattern);
      
      if (match) {
        const bucketName = match[1];
        const filePath = match[2];
        
        const { data, error } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(filePath, 3600); // 1 hour expiry
        
        if (error) {
          console.error('Error creating signed URL:', error);
          setImageError(true);
          return;
        }
        
        setSignedImageUrl(data.signedUrl);
      } else {
        // If it's not a storage URL, use it directly
        setSignedImageUrl(imageUrl);
      }
    } catch (error) {
      console.error('Error getting signed URL:', error);
      setImageError(true);
    }
  };

  const generateSolution = async () => {
    setLoading(true);
     
    try {
      const { data, error } = await supabase.functions.invoke("solve-math-problem", {
        body: { imageUrl, mode },
      });

      if (error) throw error;

      const responseBody = data && typeof data === 'object' && 'solution' in data 
          ? data
          : data?.data;

      if (!responseBody || typeof responseBody.solution === 'undefined') {
          throw new Error("AI function returned an invalid or empty response structure.");
      }

      if (mode === 'step_by_step') {
        const parsedSteps = parseSteps(responseBody.solution);
        setSteps(parsedSteps);
      } else {
        setSolution(responseBody.solution);
      }

      await supabase
        .from("question_history")
        .update({ solution_data: { solution: responseBody.solution } })
        .eq("user_id", user?.id)
        .eq("image_url", imageUrl)
        .eq("solution_mode", mode);

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      console.error('Solution error:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseSteps = (solutionText: string): Step[] => {
    const stepRegex = /Step \d+:([^|]+)\|?\s*Hint:([^|]+)\|?\s*Answer:([^\n]+)/gi;
    const parsedSteps: Step[] = [];
    let match;

    while ((match = stepRegex.exec(solutionText)) !== null) {
      parsedSteps.push({
        instruction: match[1].trim(),
        hint: match[2].trim(),
        answer: match[3].trim(),
      });
    }

    if (parsedSteps.length === 0) {
      const lines = solutionText.split('\n').filter(l => l.trim());
      lines.forEach((line, idx) => {
        if (idx < 4) {
          parsedSteps.push({
            instruction: line,
            hint: "Think about the mathematical principles involved.",
            answer: "Check your work carefully"
          });
        }
      });
    }

    return parsedSteps;
  };

  const handleSubmitAnswer = async () => {
    if (!steps[currentStep] || !userAnswer.trim()) return;

    setValidating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("validate-answer", {
        body: { 
          userAnswer: userAnswer.trim(),
          expectedAnswer: steps[currentStep].answer,
          stepInstruction: steps[currentStep].instruction,
          problemContext: "Math problem from uploaded image"
        },
      });

      if (error) throw error;

      if (data.correct) {
        const newCompletedSteps = currentStep + 1;
        setCompletedSteps(newCompletedSteps);
        
        // Save progress to database
        saveProgress(newCompletedSteps);
        
        toast({ 
          title: "✓ Correct!", 
          description: data.feedback || (currentStep < steps.length - 1 ? "Moving to next step" : "Problem completed!")
        });
        if (currentStep < steps.length - 1) {
          setCurrentStep(currentStep + 1);
          setUserAnswer("");
          setShowHint(false);
          setAttemptedWrong(false);
          setWrongAttempts(0);
          setShowAnswer(false);
        }
      } else {
        setAttemptedWrong(true);
        setWrongAttempts(prev => prev + 1);
        toast({ 
          title: "Not quite right", 
          description: data.feedback || "Try again or view a hint",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Validation error:', error);
      toast({ 
        title: "Error validating answer", 
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setValidating(false);
    }
  };

  const handleGenerateSimilar = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("solve-math-problem", {
        body: { imageUrl, mode: 'similar' },
      });
      if (error) throw error;
      setSolution(data.solution);
      navigate('/solution', { state: { imageUrl, mode: 'similar' }, replace: true });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveProgress = async (newCompletedSteps: number) => {
    try {
      await supabase
        .from("question_history")
        .update({ 
          solution_data: { 
            solution: cachedSolution || solution, 
            completedSteps: newCompletedSteps 
          } 
        })
        .eq("user_id", user?.id)
        .eq("image_url", imageUrl)
        .eq("solution_mode", mode);
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const handleContinueSolving = () => {
    setShowingSummary(false);
    setCurrentStep(completedSteps);
  };

  const handleReport = async () => {
    try {
      const { data: questionData } = await supabase
        .from("question_history")
        .select("id")
        .eq("user_id", user?.id)
        .eq("image_url", imageUrl)
        .single();

      if (questionData) {
        const { error } = await supabase
          .from("problem_reports")
          .insert({
            user_id: user?.id,
            question_id: questionData.id,
            report_reason: "AI response issue"
          });

        if (error) throw error;
        toast({ title: "Report submitted", description: "Thank you for your feedback" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Analyzing your problem...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-surface p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        {/* Problem Image */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-muted/30">
            <h3 className="font-semibold text-sm text-muted-foreground">Your Problem</h3>
          </div>
          {signedImageUrl && !imageError ? (
            <img 
              src={signedImageUrl} 
              alt="Math Problem" 
              className="w-full h-auto max-h-64 object-contain bg-background p-4"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-48 bg-muted/20">
              <ImageIcon className="w-12 h-12 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Image loading...</p>
            </div>
          )}
        </Card>

        {/* Solution Content */}
        {mode === "similar" ? (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-bold">Similar Problem Solution</h2>
            <div className="bg-accent/30 p-6 rounded-lg">
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  p: ({children}) => <p className="mb-4 leading-relaxed">{children}</p>,
                  h1: ({children}) => <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>,
                  h2: ({children}) => <h2 className="text-lg font-semibold mb-2 mt-3">{children}</h2>,
                  h3: ({children}) => <h3 className="text-base font-semibold mb-2 mt-2">{children}</h3>,
                  ul: ({children}) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
                  li: ({children}) => <li className="leading-relaxed">{children}</li>,
                  strong: ({children}) => <strong className="font-semibold text-primary">{children}</strong>,
                  code: ({children}) => (
                    <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                  ),
                  blockquote: ({children}) => (
                    <blockquote className="border-l-4 border-primary pl-4 italic my-4">{children}</blockquote>
                  ),
                }}
              >
                {solution}
              </ReactMarkdown>
            </div>
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-bold">Step-by-Step Solution</h2>
            
            {showingSummary ? (
              /* Summary view for incomplete problems from history */
              <div className="space-y-6 py-4">
                <div className="text-center space-y-2">
                  {completedSteps >= steps.length ? (
                    <>
                      <CheckCircle className="w-16 h-16 text-primary mx-auto" />
                      <h3 className="text-xl font-bold">Problem Completed!</h3>
                      <p className="text-muted-foreground">Here's a summary of all the steps you worked through.</p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mx-auto">
                        <span className="text-2xl font-bold text-warning">{completedSteps}/{steps.length}</span>
                      </div>
                      <h3 className="text-xl font-bold">Progress Summary</h3>
                      <p className="text-muted-foreground">
                        You've completed {completedSteps} of {steps.length} steps.
                      </p>
                    </>
                  )}
                </div>

                {/* Summary of completed steps */}
                {completedSteps > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-semibold text-lg border-b pb-2">Completed Steps</h4>
                    {steps.slice(0, completedSteps).map((step, idx) => (
                      <div key={idx} className="bg-accent/20 rounded-lg p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center flex-shrink-0 text-sm font-semibold">
                            {idx + 1}
                          </div>
                          <div className="flex-1 space-y-3">
                            <div>
                              <p className="font-medium text-sm text-muted-foreground mb-1">Question:</p>
                              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {step.instruction}
                              </ReactMarkdown>
                            </div>
                            
                            <div className="bg-primary/10 border border-primary/20 rounded-md p-3">
                              <p className="font-medium text-sm text-primary mb-1">Answer:</p>
                              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {step.answer}
                              </ReactMarkdown>
                            </div>

                            <details className="group">
                              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                                <Lightbulb className="w-4 h-4" />
                                <span>View Hint</span>
                              </summary>
                              <div className="mt-2 bg-warning/10 border border-warning/30 rounded-md p-3 text-sm">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {step.hint}
                                </ReactMarkdown>
                              </div>
                            </details>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  {completedSteps < steps.length ? (
                    <>
                      <Button onClick={handleContinueSolving} className="flex-1">
                        Continue from Step {completedSteps + 1}
                      </Button>
                      <Button variant="outline" onClick={() => navigate('/')}>
                        Back to Home
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => navigate('/')} className="flex-1">
                        Solve Another Problem
                      </Button>
                      <Button variant="outline" onClick={handleGenerateSimilar}>
                        Try Similar Problem
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : currentStep < steps.length ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Step {currentStep + 1} of {steps.length}</span>
                  <div className="flex gap-1">
                    {steps.map((_, idx) => (
                      <div
                        key={idx}
                        className={`w-8 h-1 rounded ${
                          idx < currentStep ? 'bg-primary' : idx === currentStep ? 'bg-primary/50' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="bg-accent/30 p-4 rounded-lg">
                  <p className="font-semibold mb-2">Step {currentStep + 1}:</p>
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {steps[currentStep].instruction}
                  </ReactMarkdown>
                </div>

                {showHint && (
                  <div className="bg-warning/10 border border-warning p-4 rounded-lg flex gap-3">
                    <Lightbulb className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Hint:</p>
                      <div className="text-sm">
                        <ReactMarkdown
                          remarkPlugins={[remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {steps[currentStep].hint}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Input
                    placeholder="Enter your answer"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !validating && handleSubmitAnswer()}
                    disabled={validating}
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSubmitAnswer} className="flex-1" disabled={validating}>
                      {validating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        "Submit Answer"
                      )}
                    </Button>
                    {!showHint && (
                      <Button variant="outline" onClick={() => setShowHint(true)}>
                        <Lightbulb className="w-4 h-4 mr-2" />
                        Hint
                      </Button>
                    )}
                  </div>
                </div>

                {wrongAttempts >= 3 && !showAnswer && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowAnswer(true)}
                    className="w-full"
                  >
                    Reveal Answer
                  </Button>
                )}

                {showAnswer && (
                  <div className="bg-primary/10 border border-primary/30 p-4 rounded-lg">
                    <p className="font-semibold text-sm text-primary mb-1">Expected Answer:</p>
                    <div className="text-foreground">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {steps[currentStep].answer}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {attemptedWrong && (
                  <Button
                    variant="outline"
                    onClick={handleGenerateSimilar}
                    className="w-full"
                  >
                    Generate Similar Problem Instead
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-6 py-4">
                <div className="text-center space-y-2">
                  <CheckCircle className="w-16 h-16 text-primary mx-auto" />
                  <h3 className="text-xl font-bold">Problem Completed!</h3>
                  <p className="text-muted-foreground">Here's a summary of all the steps you worked through.</p>
                </div>

                {/* Summary of all steps */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-lg border-b pb-2">Solution Summary</h4>
                  {steps.map((step, idx) => (
                    <div key={idx} className="bg-accent/20 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center flex-shrink-0 text-sm font-semibold">
                          {idx + 1}
                        </div>
                        <div className="flex-1 space-y-3">
                          <div>
                            <p className="font-medium text-sm text-muted-foreground mb-1">Question:</p>
                            <ReactMarkdown
                              remarkPlugins={[remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                            >
                              {step.instruction}
                            </ReactMarkdown>
                          </div>
                          
                          <div className="bg-primary/10 border border-primary/20 rounded-md p-3">
                            <p className="font-medium text-sm text-primary mb-1">Answer:</p>
                            <ReactMarkdown
                              remarkPlugins={[remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                            >
                              {step.answer}
                            </ReactMarkdown>
                          </div>

                          <details className="group">
                            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                              <Lightbulb className="w-4 h-4" />
                              <span>View Hint</span>
                            </summary>
                            <div className="mt-2 bg-warning/10 border border-warning/30 rounded-md p-3 text-sm">
                              <ReactMarkdown
                                remarkPlugins={[remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                              >
                                {step.hint}
                              </ReactMarkdown>
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-4">
                  <Button onClick={() => navigate('/')} className="flex-1">
                    Solve Another Problem
                  </Button>
                  <Button variant="outline" onClick={handleGenerateSimilar}>
                    Try Similar Problem
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        <Button
          variant="outline"
          onClick={handleReport}
          className="w-full"
        >
          <AlertCircle className="w-4 h-4 mr-2" />
          Report an Issue
        </Button>
      </div>
    </div>
  );
};

export default Solution;
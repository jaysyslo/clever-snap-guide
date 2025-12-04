import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Calendar, Loader2, Search, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Question {
  id: string;
  image_url: string;
  solution_mode: string;
  created_at: string;
  solution_data: { solution: string; completedSteps?: number; totalSteps?: number } | null | unknown;
  tags: string[] | null;
}

const getSignedUrl = async (imageUrl: string): Promise<string | null> => {
  try {
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
    if (pathMatch) {
      const [, bucketName, filePath] = pathMatch;
      const { data } = await supabase.storage.from(bucketName).createSignedUrl(filePath, 3600);
      return data?.signedUrl || null;
    }
  } catch {
    return null;
  }
  return null;
};

const SelectProblems = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [tagSearch, setTagSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());

  // Selection helpers
  const toggleQuestion = (id: string) => {
    setSelectedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedQuestions(new Set(filteredQuestions.map(q => q.id)));
  };

  const deselectAll = () => {
    setSelectedQuestions(new Set());
  };

  // Extract all unique tags from questions
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    questions.forEach(q => {
      q.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [questions]);

  // Filter tags for autocomplete suggestions
  const tagSuggestions = useMemo(() => {
    if (!tagSearch.trim()) return allTags.slice(0, 8);
    const searchLower = tagSearch.toLowerCase();
    return allTags.filter(tag => 
      tag.toLowerCase().includes(searchLower)
    ).slice(0, 8);
  }, [allTags, tagSearch]);

  // Filter questions based on tag search
  const filteredQuestions = useMemo(() => {
    if (!tagSearch.trim()) return questions;
    const searchLower = tagSearch.toLowerCase();
    return questions.filter(q => 
      q.tags?.some(tag => tag.toLowerCase().includes(searchLower))
    );
  }, [questions, tagSearch]);

  // Selection state derived values
  const allSelected = filteredQuestions.length > 0 && filteredQuestions.every(q => selectedQuestions.has(q.id));
  const someSelected = selectedQuestions.size > 0;

  const clearSearch = () => {
    setTagSearch("");
    setShowSuggestions(false);
  };

  const selectTag = (tag: string) => {
    setTagSearch(tag);
    setShowSuggestions(false);
  };

  useEffect(() => {
    loadQuestions();
  }, [user]);

  const loadQuestions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("question_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      setQuestions(data || []);
      
      // Generate signed URLs for all images
      const urls: Record<string, string> = {};
      for (const q of data || []) {
        const signedUrl = await getSignedUrl(q.image_url);
        if (signedUrl) urls[q.id] = signedUrl;
      }
      setSignedUrls(urls);
    } catch (error: any) {
      toast({ title: "Error loading problems", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateStudyGuide = async () => {
    setGenerating(true);
    try {
      const questionIds = someSelected ? Array.from(selectedQuestions) : undefined;
      const count = questionIds ? questionIds.length : questions.length;
      
      toast({ 
        title: "Generating study guide...", 
        description: `Using ${count} problem${count !== 1 ? 's' : ''}. This may take a moment.` 
      });
      
      const { data, error } = await supabase.functions.invoke("generate-study-guide", {
        body: { questionIds },
      });

      if (error) throw error;

      toast({ title: "Study guide created and saved!" });
      
      navigate('/study-guide', { 
        state: { 
          studyGuide: data.studyGuide, 
          title: data.title,
          savedGuideId: data.savedGuideId 
        } 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-surface p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/history")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Select Problems</h1>
          <div className="w-20" />
        </div>

        <p className="text-muted-foreground text-center">
          Select the problems you want to include in your study guide
        </p>

        {/* Tag Search Section */}
        {questions.length > 0 && allTags.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
            <Input
              placeholder="Search by topic..."
              value={tagSearch}
              onChange={(e) => {
                setTagSearch(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="pl-9 pr-9"
            />
            {tagSearch && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearSearch}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 z-10"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            {showSuggestions && tagSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-20 overflow-hidden">
                {tagSuggestions.map((tag) => (
                  <button
                    key={tag}
                    onMouseDown={() => selectTag(tag)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {tag}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selection Controls */}
        {questions.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {someSelected 
                ? `${selectedQuestions.size} problem${selectedQuestions.size !== 1 ? 's' : ''} selected`
                : 'No problems selected (all will be used)'}
            </span>
            <div className="flex gap-2">
              {!allSelected && (
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
              )}
              {someSelected && (
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Deselect All
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Questions List */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : questions.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No problems yet. Start solving problems first!</p>
              <Button variant="link" onClick={() => navigate("/solve")} className="mt-2">
                Solve a problem
              </Button>
            </Card>
          ) : filteredQuestions.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No problems match "{tagSearch}"</p>
              <Button variant="link" onClick={clearSearch} className="mt-2">
                Clear search
              </Button>
            </Card>
          ) : (
            filteredQuestions.map((question) => {
              const solutionData = question.solution_data as { solution?: string; completedSteps?: number; totalSteps?: number } | null;
              const completedSteps = solutionData?.completedSteps || 0;
              const totalSteps = solutionData?.totalSteps || 0;
              const isComplete = totalSteps > 0 && completedSteps >= totalSteps;
              const isSelected = selectedQuestions.has(question.id);
              
              return (
                <Card 
                  key={question.id} 
                  className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${isSelected ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => toggleQuestion(question.id)}
                >
                  <div className="flex gap-4 items-center">
                    <Checkbox 
                      checked={isSelected}
                      className="data-[state=checked]:bg-primary pointer-events-none"
                    />
                    {signedUrls[question.id] ? (
                      <img
                        src={signedUrls[question.id]}
                        alt="Problem"
                        className="w-16 h-16 object-cover rounded-lg bg-muted"
                      />
                    ) : (
                      <div className="w-16 h-16 flex items-center justify-center rounded-lg bg-muted">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(question.created_at), "MMM d, yyyy")}
                      </div>
                      <p className="text-sm">
                        <span className="capitalize">{question.solution_mode.replace("_", " ")}</span>
                      </p>
                      {question.tags && question.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {question.tags.slice(0, 3).map((tag, idx) => (
                            <span 
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {question.solution_mode === 'step_by_step' && totalSteps > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {isComplete ? (
                            <span className="text-primary font-medium">Completed</span>
                          ) : (
                            `${completedSteps}/${totalSteps} steps`
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* Generate Button */}
        {questions.length > 0 && (
          <div className="sticky bottom-6">
            <Button
              onClick={handleGenerateStudyGuide}
              disabled={generating}
              className="w-full bg-gradient-primary hover:opacity-90 transition-smooth rounded-xl py-6 text-lg"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                `Generate Study Guide ${someSelected ? `(${selectedQuestions.size})` : '(All)'}`
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectProblems;

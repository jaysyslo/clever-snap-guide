import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Trash2, Calendar, Loader2, BookOpen, Pencil, X, Search } from "lucide-react";
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

interface StudyGuide {
  id: string;
  title: string;
  content: string;
  created_at: string;
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

const History = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [studyGuides, setStudyGuides] = useState<StudyGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [editingGuide, setEditingGuide] = useState<StudyGuide | null>(null);
  const [newTitle, setNewTitle] = useState("");
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

  // Selection state derived values (must come after filteredQuestions)
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
    loadHistory();
  }, [user]);

  const loadHistory = async () => {
    if (!user) return;

    try {
      // Load questions and study guides in parallel
      const [questionsResult, guidesResult] = await Promise.all([
        supabase
          .from("question_history")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("study_guides")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
      ]);

      if (questionsResult.error) throw questionsResult.error;
      if (guidesResult.error) throw guidesResult.error;
      
      setQuestions(questionsResult.data || []);
      setStudyGuides(guidesResult.data || []);
      
      // Generate signed URLs for all images
      const urls: Record<string, string> = {};
      for (const q of questionsResult.data || []) {
        const signedUrl = await getSignedUrl(q.image_url);
        if (signedUrl) urls[q.id] = signedUrl;
      }
      setSignedUrls(urls);
    } catch (error: any) {
      toast({ title: "Error loading history", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("question_history")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      setQuestions(questions.filter(q => q.id !== id));
      toast({ title: "Question deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteGuide = async (id: string) => {
    try {
      const { error } = await supabase
        .from("study_guides")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      setStudyGuides(studyGuides.filter(g => g.id !== id));
      toast({ title: "Study guide deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleRenameGuide = async () => {
    if (!editingGuide || !newTitle.trim()) return;
    
    try {
      const { error } = await supabase
        .from("study_guides")
        .update({ title: newTitle.trim() })
        .eq("id", editingGuide.id);

      if (error) throw error;
      
      setStudyGuides(studyGuides.map(g => 
        g.id === editingGuide.id ? { ...g, title: newTitle.trim() } : g
      ));
      setEditingGuide(null);
      setNewTitle("");
      toast({ title: "Study guide renamed" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const openRenameDialog = (guide: StudyGuide) => {
    setEditingGuide(guide);
    setNewTitle(guide.title);
  };

  const handleGenerateStudyGuide = async () => {
    try {
      const questionIds = someSelected ? Array.from(selectedQuestions) : undefined;
      const count = questionIds ? questionIds.length : questions.length;
      
      toast({ 
        title: "Generating study guide...", 
        description: `Using ${count} problem${count !== 1 ? 's' : ''}. This may take a moment.` 
      });
      
      const { data, error } = await supabase.functions.invoke("generate-study-guide", {
        body: { userId: user?.id, questionIds },
      });

      if (error) throw error;

      toast({ title: "Study guide created and saved!" });
      
      // Navigate to a study guide view - it's already auto-saved
      navigate('/study-guide', { 
        state: { 
          studyGuide: data.studyGuide, 
          title: data.title,
          savedGuideId: data.savedGuideId 
        } 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-surface p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">History</h1>
          <div className="w-20" />
        </div>

        {questions.length > 0 && (
          <div className="space-y-2">
            <Button
              onClick={handleGenerateStudyGuide}
              className="w-full bg-gradient-primary hover:opacity-90 transition-smooth rounded-xl"
            >
              Generate Study Guide {someSelected && `(${selectedQuestions.size} selected)`}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {someSelected 
                  ? `${selectedQuestions.size} problem${selectedQuestions.size !== 1 ? 's' : ''} selected`
                  : 'All problems will be used'}
              </span>
              <div className="flex gap-2">
                {!allSelected && (
                  <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs">
                    Select All
                  </Button>
                )}
                {someSelected && (
                  <Button variant="ghost" size="sm" onClick={deselectAll} className="h-7 text-xs">
                    Deselect All
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

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
            {/* Autocomplete Suggestions */}
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

        {/* Saved Study Guides Section */}
        {studyGuides.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-muted-foreground">Saved Study Guides</h2>
            {studyGuides.map((guide) => (
              <Card
                key={guide.id}
                className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate('/study-guide', { 
                  state: { studyGuide: guide.content, savedGuideId: guide.id } 
                })}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{guide.title}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(guide.created_at), "MMM d, yyyy")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRenameDialog(guide);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGuide(guide.id);
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Questions Section */}
        <div className="space-y-3">
          {studyGuides.length > 0 && questions.length > 0 && (
            <h2 className="text-lg font-semibold text-muted-foreground">
              Problem History
              {tagSearch && (
                <span className="text-sm font-normal ml-2">
                  ({filteredQuestions.length} of {questions.length})
                </span>
              )}
            </h2>
          )}
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : questions.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No questions yet. Start solving problems!</p>
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
              const cachedSolution = solutionData?.solution;
              const completedSteps = solutionData?.completedSteps || 0;
              const totalSteps = solutionData?.totalSteps || 0;
              const isComplete = totalSteps > 0 && completedSteps >= totalSteps;
              const isSelected = selectedQuestions.has(question.id);
              
              return (
                <Card 
                  key={question.id} 
                  className={`p-4 hover:bg-muted/50 transition-colors ${isSelected ? 'ring-2 ring-primary' : ''}`}
                >
                  <div className="flex gap-4">
                    <button 
                      type="button"
                      className="flex items-center justify-center w-8 h-24 shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleQuestion(question.id);
                      }}
                    >
                      <Checkbox 
                        checked={isSelected}
                        className="data-[state=checked]:bg-primary pointer-events-none"
                      />
                    </button>
                    <div 
                      className="flex gap-4 flex-1 cursor-pointer"
                      onClick={() => navigate('/solution', { 
                        state: { 
                          imageUrl: question.image_url, 
                          mode: question.solution_mode,
                          cachedSolution,
                          completedSteps,
                          startStep: completedSteps,
                          viewSummary: question.solution_mode === 'step_by_step' && cachedSolution
                        } 
                      })}
                    >
                    {signedUrls[question.id] ? (
                      <img
                        src={signedUrls[question.id]}
                        alt="Problem"
                        className="w-24 h-24 object-cover rounded-lg bg-muted"
                      />
                    ) : (
                      <div className="w-24 h-24 flex items-center justify-center rounded-lg bg-muted">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(question.created_at), "MMM d, yyyy")}
                      </div>
                      <p className="text-sm">
                        Mode: <span className="font-semibold capitalize">{question.solution_mode.replace("_", " ")}</span>
                      </p>
                      {question.tags && question.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {question.tags.map((tag, idx) => (
                            <span 
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {question.solution_mode === 'step_by_step' && cachedSolution && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {isComplete ? (
                              <span className="text-primary font-medium">Completed!</span>
                            ) : totalSteps > 0 ? (
                              `Progress: ${completedSteps}/${totalSteps} steps`
                            ) : (
                              'Not started'
                            )}
                          </p>
                          {totalSteps > 0 && (
                            <div className="flex gap-0.5">
                              {Array.from({ length: totalSteps }).map((_, idx) => (
                                <div
                                  key={idx}
                                  className={`h-1 flex-1 rounded-full ${
                                    idx < completedSteps ? 'bg-primary' : 'bg-muted'
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(question.id);
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Rename Dialog */}
      <Dialog open={!!editingGuide} onOpenChange={(open) => !open && setEditingGuide(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Study Guide</DialogTitle>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Enter new name"
            maxLength={100}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGuide(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameGuide} disabled={!newTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default History;

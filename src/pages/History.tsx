import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Trash2, Calendar, Loader2, BookOpen, Pencil } from "lucide-react";
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
      toast({ title: "Generating study guide...", description: "This may take a moment." });
      
      const { data, error } = await supabase.functions.invoke("generate-study-guide", {
        body: { userId: user?.id },
      });

      if (error) throw error;

      // Navigate to a study guide view with the generated title
      navigate('/study-guide', { state: { studyGuide: data.studyGuide, title: data.title } });
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
          <Button
            onClick={handleGenerateStudyGuide}
            className="w-full bg-gradient-primary hover:opacity-90 transition-smooth rounded-xl"
          >
            Generate Study Guide
          </Button>
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
            <h2 className="text-lg font-semibold text-muted-foreground">Problem History</h2>
          )}
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : questions.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No questions yet. Start solving problems!</p>
            </Card>
          ) : (
            questions.map((question) => {
              const solutionData = question.solution_data as { solution?: string; completedSteps?: number; totalSteps?: number } | null;
              const cachedSolution = solutionData?.solution;
              const completedSteps = solutionData?.completedSteps || 0;
              const totalSteps = solutionData?.totalSteps || 0;
              const isComplete = totalSteps > 0 && completedSteps >= totalSteps;
              
              return (
                <Card 
                  key={question.id} 
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
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
                  <div className="flex gap-4">
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

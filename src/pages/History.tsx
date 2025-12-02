import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Trash2, Calendar, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Question {
  id: string;
  image_url: string;
  solution_mode: string;
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
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    loadHistory();
  }, [user]);

  const loadHistory = async () => {
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

  const handleGenerateStudyGuide = async () => {
    try {
      toast({ title: "Generating study guide...", description: "This may take a moment." });
      
      const { data, error } = await supabase.functions.invoke("generate-study-guide", {
        body: { userId: user?.id },
      });

      if (error) throw error;

      // Navigate to a study guide view or show in modal
      navigate('/study-guide', { state: { studyGuide: data.studyGuide } });
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

        <div className="space-y-4">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : questions.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No questions yet. Start solving problems!</p>
            </Card>
          ) : (
            questions.map((question) => (
              <Card key={question.id} className="p-4">
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
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(question.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default History;

import { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Save, Check, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import "katex/dist/katex.min.css";

const StudyGuide = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { studyGuide, savedGuideId } = location.state || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!savedGuideId);
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    if (!user || !studyGuide) return;
    
    setSaving(true);
    try {
      const title = `Study Guide - ${new Date().toLocaleDateString()}`;
      const { error } = await supabase
        .from("study_guides")
        .insert({
          user_id: user.id,
          title,
          content: studyGuide,
        });

      if (error) throw error;
      
      setSaved(true);
      toast({ title: "Study guide saved!" });
    } catch (error: any) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = () => {
    if (!contentRef.current) return;
    
    setExporting(true);
    
    try {
      const content = contentRef.current.innerHTML;
      
      // Create hidden iframe for printing
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) {
        toast({ title: "Export failed", variant: "destructive" });
        setExporting(false);
        return;
      }

      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Study Guide - ${new Date().toLocaleDateString()}</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: 'Times New Roman', Times, Georgia, serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #000;
              background: #fff;
              margin: 0;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 { font-size: 20pt; font-weight: bold; margin: 24pt 0 12pt 0; padding-bottom: 8pt; border-bottom: 2px solid #333; }
            h2 { font-size: 16pt; font-weight: bold; margin: 20pt 0 10pt 0; color: #333; }
            h3 { font-size: 14pt; font-weight: bold; margin: 16pt 0 8pt 0; }
            p { margin: 10pt 0; text-align: justify; }
            ul, ol { margin: 10pt 0 10pt 20pt; padding-left: 15pt; }
            li { margin: 6pt 0; }
            hr { border: none; border-top: 1px solid #ccc; margin: 20pt 0; }
            details { margin: 16pt 0; padding: 12pt; background: #f9f9f9; border-left: 3px solid #333; }
            details[open] summary { margin-bottom: 10pt; }
            summary { font-weight: bold; }
            .katex { font-size: 1.1em; }
            .katex-display { margin: 16pt 0; text-align: center; }
            code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; }
            strong { font-weight: bold; }
            em { font-style: italic; }
            @media print {
              body { padding: 0; margin: 20px; }
              details { break-inside: avoid; }
              h1, h2, h3 { break-after: avoid; }
            }
          </style>
        </head>
        <body>${content}</body>
        </html>
      `);
      iframeDoc.close();

      // Expand all details and print after content loads
      setTimeout(() => {
        iframeDoc.querySelectorAll('details').forEach(d => d.setAttribute('open', 'true'));
        
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        
        // Clean up iframe after printing
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
      
      toast({ 
        title: "Print dialog opened", 
        description: "Select 'Save as PDF' to download your study guide" 
      });
    } catch (error: any) {
      console.error('PDF export error:', error);
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (!studyGuide) {
    return (
      <div className="min-h-screen bg-gradient-surface p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Button variant="ghost" onClick={() => navigate("/history")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to History
          </Button>
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No study guide available</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-surface p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/history")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to History
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={exporting}
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? "Exporting..." : "Export PDF"}
            </Button>
            {!savedGuideId && (
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving || saved}
              >
                {saved ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save Guide"}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <Card ref={contentRef} className="p-8 space-y-6">
          <h1 className="text-2xl font-bold">Your Personalized Study Guide</h1>
          <div className="prose prose-base max-w-none dark:prose-invert prose-headings:mt-8 prose-headings:mb-4 prose-p:my-4 prose-p:leading-relaxed prose-li:my-2 prose-ul:my-4 prose-ol:my-4 prose-hr:my-8">
            <div className="space-y-6">
              <ReactMarkdown 
                remarkPlugins={[remarkMath]} 
                rehypePlugins={[rehypeKatex, rehypeRaw]}
                components={{
                  h1: ({ children, ...props }) => (
                    <h1 {...props} className="text-2xl font-bold mt-8 mb-4 pb-2 border-b border-border">{children}</h1>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2 {...props} className="text-xl font-semibold mt-8 mb-4 text-primary">{children}</h2>
                  ),
                  h3: ({ children, ...props }) => (
                    <h3 {...props} className="text-lg font-semibold mt-6 mb-3">{children}</h3>
                  ),
                  p: ({ children, ...props }) => (
                    <p {...props} className="my-4 leading-relaxed text-foreground/90">{children}</p>
                  ),
                  ul: ({ children, ...props }) => (
                    <ul {...props} className="my-4 ml-6 space-y-2 list-disc">{children}</ul>
                  ),
                  ol: ({ children, ...props }) => (
                    <ol {...props} className="my-4 ml-6 space-y-2 list-decimal">{children}</ol>
                  ),
                  li: ({ children, ...props }) => (
                    <li {...props} className="my-2 leading-relaxed">{children}</li>
                  ),
                  hr: ({ ...props }) => (
                    <hr {...props} className="my-8 border-border" />
                  ),
                  strong: ({ children, ...props }) => (
                    <strong {...props} className="font-semibold text-foreground">{children}</strong>
                  ),
                  details: ({ children, ...props }) => (
                    <details {...props} className="my-6 rounded-lg bg-muted/50 p-5 border border-border">
                      {children}
                    </details>
                  ),
                  summary: ({ children, ...props }) => (
                    <summary {...props} className="cursor-pointer font-semibold text-primary hover:text-primary/80 py-1">
                      {children}
                    </summary>
                  ),
                }}
              >
                {studyGuide}
              </ReactMarkdown>
            </div>
          </div>
        </Card>

        <Button
          onClick={() => navigate("/")}
          className="w-full bg-gradient-primary hover:opacity-90 transition-smooth rounded-xl"
        >
          Practice More Problems
        </Button>
      </div>
    </div>
  );
};

export default StudyGuide;
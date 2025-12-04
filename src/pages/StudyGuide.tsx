import { useState } from "react";
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
import html2pdf from "html2pdf.js";
import katex from "katex";
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

  const handleExportPDF = async () => {
    if (!studyGuide) return;
    
    setExporting(true);
    try {
      // Create a simple, clean HTML document for PDF
      const pdfContainer = document.createElement('div');
      pdfContainer.style.cssText = `
        font-family: 'Times New Roman', Times, serif;
        font-size: 14px;
        line-height: 1.8;
        color: #000;
        background: #fff;
        padding: 40px;
        width: 700px;
      `;

      // Process the study guide content
      let content = studyGuide;
      
      // Render LaTeX math using KaTeX
      content = content.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
        try {
          return `<div style="text-align: center; margin: 16px 0;">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
        } catch {
          return `<pre>${math}</pre>`;
        }
      });
      
      content = content.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
        try {
          return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
        } catch {
          return `<code>${math}</code>`;
        }
      });

      // Convert markdown to HTML
      content = content
        // Headers
        .replace(/^### (.*$)/gim, '<h3 style="font-size: 16px; font-weight: bold; margin: 20px 0 10px;">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 style="font-size: 18px; font-weight: bold; margin: 24px 0 12px;">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 style="font-size: 22px; font-weight: bold; margin: 28px 0 14px; border-bottom: 2px solid #333; padding-bottom: 8px;">$1</h1>')
        // Bold and italic
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        // Lists
        .replace(/^- (.*$)/gim, '<li style="margin: 6px 0 6px 24px;">$1</li>')
        .replace(/^\d+\. (.*$)/gim, '<li style="margin: 6px 0 6px 24px;">$1</li>')
        // Horizontal rules
        .replace(/^---$/gim, '<hr style="margin: 20px 0; border: none; border-top: 1px solid #ccc;">')
        // Paragraphs (double newlines)
        .replace(/\n\n/g, '</p><p style="margin: 12px 0;">')
        // Single newlines
        .replace(/\n/g, '<br>')
        // Details/summary for solutions - expand them for PDF
        .replace(/<details>/g, '<div style="margin: 16px 0; padding: 12px; background: #f5f5f5; border-left: 3px solid #333;">')
        .replace(/<\/details>/g, '</div>')
        .replace(/<summary>(.*?)<\/summary>/g, '<div style="font-weight: bold; margin-bottom: 8px;">$1</div>');

      pdfContainer.innerHTML = `
        <h1 style="font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px;">
          Study Guide
        </h1>
        <div style="margin: 0;">
          <p style="margin: 12px 0;">${content}</p>
        </div>
      `;

      // Add KaTeX CSS inline
      const katexCSS = document.createElement('style');
      katexCSS.textContent = '.katex { font-size: 1.1em; }';
      pdfContainer.prepend(katexCSS);

      // Position container so html2canvas can capture it
      pdfContainer.style.position = 'fixed';
      pdfContainer.style.top = '0';
      pdfContainer.style.left = '0';
      pdfContainer.style.zIndex = '9999';
      pdfContainer.style.background = 'white';
      document.body.appendChild(pdfContainer);

      // Small delay to ensure rendering
      await new Promise(resolve => setTimeout(resolve, 100));

      const opt = {
        margin: 10,
        filename: `study-guide-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollY: 0,
          scrollX: 0
        },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };
      
      await html2pdf().set(opt).from(pdfContainer).save();
      document.body.removeChild(pdfContainer);
      toast({ title: "PDF exported successfully!" });
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

        <Card className="p-8 space-y-6">
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
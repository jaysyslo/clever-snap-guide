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
      // Parse content to separate main content from solutions
      const sections = studyGuide.split(/(?=##\s)/);
      let mainContent = '';
      let solutionsContent = '';
      
      sections.forEach((section: string) => {
        // Check if this section contains practice problems with solutions
        if (section.includes('<details>') || section.includes('Show Full Solution')) {
          // Extract the section without the details/solutions for main content
          const cleanSection = section.replace(/<details[\s\S]*?<\/details>/g, '[See solutions section]');
          mainContent += cleanSection;
          
          // Extract solutions for the solutions page
          const detailsMatches = section.match(/<details[\s\S]*?<\/details>/g);
          if (detailsMatches) {
            const sectionTitle = section.match(/##\s*([^\n]+)/)?.[1] || 'Practice Problems';
            solutionsContent += `\n\n## Solutions: ${sectionTitle}\n\n`;
            detailsMatches.forEach((detail, idx) => {
              const solutionContent = detail.replace(/<\/?details>/g, '').replace(/<summary>[\s\S]*?<\/summary>/g, '');
              solutionsContent += `**Solution ${idx + 1}:**\n${solutionContent}\n\n`;
            });
          }
        } else {
          mainContent += section;
        }
      });

      // Create a clean HTML element for PDF
      const pdfContainer = document.createElement('div');
      pdfContainer.style.cssText = 'font-family: Georgia, serif; color: #1a1a1a; background: white; padding: 20px; max-width: 800px;';
      
      pdfContainer.innerHTML = `
        <div style="margin-bottom: 40px;">
          <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">Your Personalized Study Guide</h1>
          <div id="main-content" style="line-height: 1.8;"></div>
        </div>
        ${solutionsContent ? `
          <div style="page-break-before: always; padding-top: 20px;">
            <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">Full Solutions</h1>
            <div id="solutions-content" style="line-height: 1.8;"></div>
          </div>
        ` : ''}
      `;

      // Render markdown to HTML for main content
      const mainContentDiv = pdfContainer.querySelector('#main-content');
      const solutionsContentDiv = pdfContainer.querySelector('#solutions-content');
      
      if (mainContentDiv) {
        mainContentDiv.innerHTML = await renderMarkdownToHTML(mainContent);
      }
      if (solutionsContentDiv && solutionsContent) {
        solutionsContentDiv.innerHTML = await renderMarkdownToHTML(solutionsContent);
      }

      document.body.appendChild(pdfContainer);

      const opt = {
        margin: [15, 15, 15, 15] as [number, number, number, number],
        filename: `study-guide-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
        pagebreak: { mode: ['css', 'legacy'] }
      };
      
      await html2pdf().set(opt).from(pdfContainer).save();
      document.body.removeChild(pdfContainer);
      toast({ title: "PDF exported successfully!" });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const renderMarkdownToHTML = async (markdown: string): Promise<string> => {
    // Simple markdown to HTML conversion for PDF
    let html = markdown
      .replace(/^### (.*$)/gim, '<h3 style="font-size: 16px; font-weight: 600; margin: 20px 0 10px;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="font-size: 18px; font-weight: 600; margin: 25px 0 12px; color: #4a5568;">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 style="font-size: 22px; font-weight: bold; margin: 30px 0 15px;">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^\- (.*$)/gim, '<li style="margin: 8px 0; margin-left: 20px;">$1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li style="margin: 8px 0; margin-left: 20px;">$1</li>')
      .replace(/\n\n/g, '</p><p style="margin: 12px 0;">')
      .replace(/\$\$(.*?)\$\$/g, '<span style="font-family: monospace; background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">$1</span>')
      .replace(/\$(.*?)\$/g, '<span style="font-family: monospace; background: #f5f5f5; padding: 1px 4px; border-radius: 2px;">$1</span>')
      .replace(/---/g, '<hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">')
      .replace(/\[See solutions section\]/g, '<em style="color: #666;">[See solutions section at end of document]</em>');
    
    return `<p style="margin: 12px 0;">${html}</p>`;
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
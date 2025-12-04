import { useState, useCallback } from "react";
import { HelpCircle, Bug, MessageCircleQuestion, Lightbulb, Video, Send, X, Upload, Image, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type FeedbackType = "bug" | "question" | "feature";

const TYPE_EMOJI = {
  bug: "🐛",
  question: "❓",
  feature: "💡",
};

const TYPE_LABEL = {
  bug: "Bug Report",
  question: "Question",
  feature: "Feature Request",
};

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("question");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loomUrl, setLoomUrl] = useState("");
  const [attachments, setAttachments] = useState<{ file: File; preview: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { effectiveProfile } = useAuth();

  // Upload image to Supabase Storage
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `feedback/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('feedback-attachments')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (error) {
        console.error('Upload error:', error);
        // If bucket doesn't exist, return null gracefully
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('feedback-attachments')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload attachments and get URLs
      const uploadedUrls: string[] = [];
      for (const attachment of attachments) {
        const url = await uploadImage(attachment.file);
        if (url) uploadedUrls.push(url);
      }

      // Build message content
      const userName = effectiveProfile?.full_name || "Unknown";
      const userEmail = effectiveProfile?.email || "Unknown";
      const userRole = effectiveProfile?.role || "Unknown";
      const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
      
      let message = "";
      if (description.trim()) {
        message += description.trim();
      }
      if (loomUrl.trim()) {
        message += `\n\n🎥 Loom: ${loomUrl.trim()}`;
      }

      // Call the edge function instead of n8n webhook
      const { data, error } = await supabase.functions.invoke('send-slack-notification', {
        body: {
          type: 'feedback',
          title: title.trim(),
          message: message || "(No additional details provided)",
          imageUrls: uploadedUrls,
          metadata: {
            feedbackType,
            submittedBy: `${userName} (${userEmail})`,
            userRole,
            appVersion,
            currentUrl: window.location.href,
          },
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        throw new Error("Failed to submit feedback");
      }

      if (!data?.sent && !data?.success) {
        console.warn("Notification may not have been delivered:", data);
      }

      toast.success("Thank you! Your feedback has been submitted.");
      
      // Reset form
      setTitle("");
      setDescription("");
      setLoomUrl("");
      setAttachments([]);
      setFeedbackType("question");
      setIsOpen(false);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast.error("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) {
      toast.error("Please drop image files only");
      return;
    }
    
    const newAttachments = files.slice(0, 3 - attachments.length).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    
    setAttachments(prev => [...prev, ...newAttachments].slice(0, 3));
  }, [attachments.length]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    const newAttachments = files.slice(0, 3 - attachments.length).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setAttachments(prev => [...prev, ...newAttachments].slice(0, 3));
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const feedbackOptions = [
    { value: "bug", label: "Bug Report", icon: Bug, color: "text-red-500" },
    { value: "question", label: "Question", icon: MessageCircleQuestion, color: "text-blue-500" },
    { value: "feature", label: "Feature Request", icon: Lightbulb, color: "text-amber-500" },
  ];

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center"
        aria-label="Help & Feedback"
      >
        <HelpCircle className="w-7 h-7" />
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-background border rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Help & Feedback</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Feedback Type */}
              <div className="space-y-2">
                <Label>What would you like to share?</Label>
                <RadioGroup
                  value={feedbackType}
                  onValueChange={(v) => setFeedbackType(v as FeedbackType)}
                  className="grid grid-cols-3 gap-2"
                >
                  {feedbackOptions.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={option.value}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        feedbackType === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem
                        value={option.value}
                        id={option.value}
                        className="sr-only"
                      />
                      <option.icon className={`w-5 h-5 ${option.color}`} />
                      <span className="text-xs font-medium">{option.label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="feedback-title">Title *</Label>
                <Input
                  id="feedback-title"
                  placeholder={
                    feedbackType === "bug"
                      ? "What's not working?"
                      : feedbackType === "feature"
                      ? "What would you like to see?"
                      : "What's your question?"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="feedback-description">Details (optional)</Label>
                <Textarea
                  id="feedback-description"
                  placeholder="Add more context or steps to reproduce..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-green-500" />
                  <Label>Screenshots (optional)</Label>
                </div>
                
                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Drag & drop images or <span className="text-primary">browse</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Max 3 images</p>
                  </label>
                </div>

                {/* Preview attachments */}
                {attachments.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {attachments.map((att, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={att.preview}
                          alt={`Attachment ${i + 1}`}
                          className="w-16 h-16 object-cover rounded border"
                        />
                        <button
                          onClick={() => removeAttachment(i)}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Loom Video */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-purple-500" />
                  <Label htmlFor="loom-url">Loom Video (optional)</Label>
                </div>
                <Input
                  id="loom-url"
                  placeholder="Paste your Loom URL here"
                  value={loomUrl}
                  onChange={(e) => setLoomUrl(e.target.value)}
                />
                <a
                  href="https://www.loom.com/record"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Video className="w-3 h-3" />
                  Record a Loom video →
                </a>
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim()}
                className="w-full"
              >
                {isSubmitting ? (
                  "Submitting..."
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Feedback
                  </>
                )}
              </Button>

              {/* Footer note */}
              <p className="text-xs text-muted-foreground text-center">
                Your feedback helps us improve Book Builder
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


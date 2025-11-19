import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Lightbulb } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AIRuleGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onRuleGenerated: (rule: any) => void;
  existingRules: any[];
}

const EXAMPLE_PROMPTS = [
  "Assign all technology accounts over $1M ARR to West region reps",
  "Balance high-risk CRE accounts so no rep gets more than 3",
  "Keep continuity for accounts owned longer than 90 days in the same region",
  "Route enterprise accounts to senior reps with 5+ years experience"
];

export function AIRuleGenerator({ isOpen, onClose, onRuleGenerated, existingRules }: AIRuleGeneratorProps) {
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRule, setGeneratedRule] = useState<any>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast({
        title: "Description Required",
        description: "Please describe the rule you want to create",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-assignment-rule', {
        body: {
          description: description.trim(),
          existingRules: existingRules.map(r => ({
            name: r.name,
            rule_type: r.rule_type,
            priority: r.priority
          }))
        }
      });

      if (error) throw error;

      console.log('[AI RULE GEN] ✅ Generated rule:', data.rule);
      setGeneratedRule(data.rule);

      toast({
        title: "Rule Generated! 🎉",
        description: "Review and adjust the rule below before saving"
      });
    } catch (error: any) {
      console.error('[AI RULE GEN] Error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate rule. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (generatedRule) {
      onRuleGenerated(generatedRule);
      setDescription("");
      setGeneratedRule(null);
      onClose();
    }
  };

  const handleCancel = () => {
    setDescription("");
    setGeneratedRule(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Assignment Rule Generator
          </DialogTitle>
          <DialogDescription>
            Describe what you want the rule to do in plain English, and AI will generate a structured rule for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!generatedRule ? (
            <>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Describe Your Rule
                </label>
                <Textarea
                  placeholder="Example: Assign all technology accounts with over $500K ARR to North East region reps who have technology industry experience..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <Alert>
                <Lightbulb className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-2">Example Prompts:</div>
                  <ul className="text-sm space-y-1">
                    {EXAMPLE_PROMPTS.map((prompt, i) => (
                      <li key={i} className="text-muted-foreground">
                        • {prompt}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            </>
          ) : (
            <div className="space-y-4">
              <Alert className="border-primary/50 bg-primary/5">
                <Sparkles className="h-4 w-4 text-primary" />
                <AlertDescription>
                  <div className="font-medium text-primary mb-2">AI Generated Rule</div>
                  <div className="space-y-2 text-sm">
                    <div><strong>Name:</strong> {generatedRule.name}</div>
                    <div><strong>Type:</strong> {generatedRule.rule_type}</div>
                    <div><strong>Description:</strong> {generatedRule.description}</div>
                    <div><strong>Priority:</strong> {generatedRule.priority}</div>
                    <div><strong>Scope:</strong> {generatedRule.account_scope}</div>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm font-medium mb-2">Generated Configuration:</div>
                <pre className="text-xs overflow-auto max-h-60 bg-background p-3 rounded">
                  {JSON.stringify(generatedRule, null, 2)}
                </pre>
              </div>

              <Alert>
                <AlertDescription className="text-sm">
                  Review the generated rule. You can edit it after saving using the rule builder.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          {!generatedRule ? (
            <Button onClick={handleGenerate} disabled={isGenerating || !description.trim()}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Rule
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleSave}>
              Save Rule
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

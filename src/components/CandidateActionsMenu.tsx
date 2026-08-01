import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

// A per-candidate Delete button that behaves exactly like the Dashboard's:
// it does NOT permanently delete — it archives the candidate (is_archived = true)
// so they drop off the current screen/stage and appear on Archived Candidates,
// where they can be restored. Available from every screen and stage.
export default function CandidateActionsMenu({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [archiving, setArchiving] = useState(false);

  const handleDelete = async () => {
    setArchiving(true);
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ is_archived: true })
        .eq("id", candidateId);
      if (error) throw error;

      void supabase.from("activity_logs").insert({
        action: "CANDIDATE_ARCHIVED",
        details: `${candidateName} moved to Archived Candidates`,
      });

      // Archive/delete affects many lists across the app — refresh everything so
      // the candidate disappears here and shows up under Archived Candidates.
      queryClient.invalidateQueries();

      toast({
        title: "Moved to Archived",
        description: `${candidateName} has been archived. Restore them from Archived Candidates.`,
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to archive candidate.",
        variant: "destructive",
      });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
      title="Delete candidate (move to Archived)"
      aria-label="Delete candidate"
      onClick={(e) => {
        e.stopPropagation();
        void handleDelete();
      }}
      disabled={archiving}
    >
      {archiving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  );
}

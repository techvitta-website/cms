import { useState } from "react";
import { MoreVertical, Archive, Trash2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Per-candidate admin actions available from any stage/page:
//   • Move to Archive  — soft-remove; candidate shows on Archived Candidates.
//   • Delete candidate — permanent; DB foreign keys cascade/​set-null related rows.
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
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Archive/delete affect many lists across the app — refresh everything.
  const refreshAll = () => queryClient.invalidateQueries();

  const handleArchive = async () => {
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

      toast({
        title: "Archived",
        description: `${candidateName} has been moved to Archived Candidates.`,
      });
      refreshAll();
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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("candidates").delete().eq("id", candidateId);
      if (error) throw error;

      toast({
        title: "Deleted",
        description: `${candidateName} has been permanently deleted.`,
      });
      setConfirmDeleteOpen(false);
      refreshAll();
    } catch (e: any) {
      const fk = e?.code === "23503" || /foreign key/i.test(e?.message || "");
      toast({
        title: fk ? "Couldn't delete" : "Error",
        description: fk
          ? "This candidate is still linked to other records. Use Archive instead."
          : e.message || "Failed to delete candidate.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Candidate actions"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleArchive} disabled={archiving}>
            {archiving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Archive className="h-4 w-4 mr-2" />
            )}
            Move to Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setConfirmDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete candidate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {candidateName}?</DialogTitle>
            <DialogDescription>
              This permanently removes the candidate and their related records (interviews,
              documents, letters). This can't be undone — if you might need them later, use
              Archive instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

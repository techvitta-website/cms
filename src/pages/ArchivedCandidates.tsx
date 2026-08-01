import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, FileX, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RawCandidate {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  job_id: string | null;
  resume_url: string | null;
  reference_source: string | null;
  jobs?: {
    job_title: string;
  } | null;
}

export default function ArchivedCandidates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [unarchivingCandidateId, setUnarchivingCandidateId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<RawCandidate | null>(null);

  // Fetch archived candidates
  const { data: archivedCandidates = [], refetch: refetchArchived, isLoading } = useQuery({
    queryKey: ['archived-candidates'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('candidates')
          .select(`
            id,
            full_name,
            email,
            phone,
            status,
            created_at,
            job_id,
            resume_url,
            reference_source,
            jobs (
              job_title
            )
          `)
          .eq('is_archived', true)
          .order('created_at', { ascending: false });

        if (error) {
          // If column doesn't exist, return empty array
          if (error.message?.includes('is_archived') || error.message?.includes('column') || error.message?.includes('schema cache')) {
            return [];
          }
          throw error;
        }
        return (data || []) as RawCandidate[];
      } catch (error: any) {
        // If column doesn't exist, return empty array
        if (error.message?.includes('is_archived') || error.message?.includes('column') || error.message?.includes('schema cache')) {
          return [];
        }
        throw error;
      }
    },
  });

  // Unarchive candidate function
  const handleUnarchive = async (candidateId: string) => {
    setUnarchivingCandidateId(candidateId);
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ is_archived: false })
        .eq("id", candidateId);

      if (error) throw error;

      // Invalidate queries to refresh both archived and main lists
      await queryClient.invalidateQueries({ queryKey: ["all-candidates-with-storage"] });
      await queryClient.invalidateQueries({ queryKey: ["archived-candidates"] });

      toast({
        title: "Candidate Unarchived",
        description: "Candidate has been restored to the dashboard.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to unarchive candidate.",
        variant: "destructive",
      });
    } finally {
      setUnarchivingCandidateId(null);
      refetchArchived();
    }
  };

  // Permanently delete a candidate from the database. Foreign keys cascade /
  // set-null, so their interviews, documents and letters are removed too.
  const handleDeletePermanently = async () => {
    if (!toDelete) return;
    setDeletingId(toDelete.id);
    try {
      const { error } = await supabase.from("candidates").delete().eq("id", toDelete.id);
      if (error) throw error;

      await queryClient.invalidateQueries();
      toast({
        title: "Deleted permanently",
        description: `${toDelete.full_name} and all their records have been removed from the database.`,
      });
      setToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete candidate.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
      refetchArchived();
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Archived Candidates</CardTitle>
          <CardDescription>
            Restore an archived candidate with Unarchive, or use Delete to permanently remove them
            (and all their records) from the database — this can't be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : archivedCandidates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileX className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No archived candidates found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Job Applied</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedCandidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="font-medium">{candidate.full_name}</TableCell>
                    <TableCell>{candidate.email}</TableCell>
                    <TableCell>{candidate.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{candidate.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {(candidate.jobs as any)?.job_title || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnarchive(candidate.id)}
                          disabled={unarchivingCandidateId === candidate.id || deletingId === candidate.id}
                        >
                          {unarchivingCandidateId === candidate.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Unarchiving...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Unarchive
                            </>
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setToDelete(candidate)}
                          disabled={deletingId === candidate.id}
                        >
                          {deletingId === candidate.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Permanent delete confirmation */}
      <Dialog open={!!toDelete} onOpenChange={(open) => !open && !deletingId && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {toDelete?.full_name} permanently?</DialogTitle>
            <DialogDescription>
              This permanently removes the candidate and all of their related records — interviews,
              uploaded documents, and offer / experience / rejection letters — from the database.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={!!deletingId}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeletePermanently} disabled={!!deletingId}>
              {deletingId ? (
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
    </div>
  );
}



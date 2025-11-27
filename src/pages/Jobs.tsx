import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Edit, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Jobs() {
  const [showForm, setShowForm] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    job_title: "",
    department: "",
    description: "",
    required_skills: "",
  });
  const [deletingJobId, setDeletingJobId] = useState<string | number | null>(null);
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const HIDDEN_JOBS_KEY = "cms-hidden-jobs";

  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(HIDDEN_JOBS_KEY) : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHiddenJobIds(new Set(parsed.map(String)));
        }
      }
    } catch (err) {
      console.warn("Failed to load hidden jobs", err);
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(HIDDEN_JOBS_KEY, JSON.stringify(Array.from(hiddenJobIds)));
      }
    } catch (err) {
      console.warn("Failed to persist hidden jobs", err);
    }
  }, [hiddenJobIds]);

  // Fetch all jobs
  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    try {
      const skillsString = formData.get('skills') as string;
      const skillsArray = skillsString.split(',').map(s => s.trim());
      
      const { error } = await supabase
        .from('jobs')
        .insert({
          job_title: formData.get('job-title') as string,
          department: formData.get('department') as string,
          description: formData.get('description') as string,
          required_skills: skillsArray,
          experience_required: null,
        });

      if (error) throw error;

      toast({
        title: "Job saved successfully!",
        description: "The job posting has been added to the database",
      });
      
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
      await queryClient.invalidateQueries({ queryKey: ['jobs-count'] });
      setShowForm(false);
    } catch (error) {
      toast({
        title: "Error saving job",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (job: any) => {
    setEditingJob(job);
    setEditForm({
      job_title: job.job_title ?? "",
      department: job.department ?? "",
      description: job.description ?? "",
      required_skills: Array.isArray(job.required_skills) ? job.required_skills.join(", ") : job.required_skills ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleUpdateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob) return;

    try {
      const skillsArray = editForm.required_skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from("jobs")
        .update({
          job_title: editForm.job_title,
          department: editForm.department,
          description: editForm.description,
          required_skills: skillsArray,
          experience_required: null,
        })
        .eq("id", editingJob.id);

      if (error) throw error;

      toast({
        title: "Job updated",
        description: `${editForm.job_title} has been updated successfully.`,
      });

      setEditDialogOpen(false);
      setEditingJob(null);
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs-count"] });
      queryClient.setQueryData(["jobs"], (current: any[] | undefined) => {
        if (!current) return current;
        return current.map((existingJob) =>
          existingJob.id === editingJob.id
            ? {
                ...existingJob,
                job_title: editForm.job_title,
                department: editForm.department,
                description: editForm.description,
                required_skills: skillsArray,
              }
            : existingJob
        );
      });
    } catch (error: any) {
      toast({
        title: "Error updating job",
        description: error.message || "Could not update the job details.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteJob = async (job: any) => {
    setDeletingJobId(job.id);
    try {
      const idToDelete = job.id;

      // Optimistically remove from UI immediately
      queryClient.setQueryData(["jobs"], (oldData: any[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.filter((existingJob) => existingJob.id !== idToDelete);
      });

      // Optimistically update jobs count
      queryClient.setQueryData(["jobs-count"], (oldCount: number | undefined) => {
        return (oldCount ?? 0) > 0 ? oldCount - 1 : 0;
      });

      // Delete all matches associated with this job first
      const { error: matchesError } = await supabase
        .from("matches")
        .delete()
        .eq("job_id", idToDelete);

      if (matchesError) throw matchesError;

      // Then delete the job
      const { error } = await supabase
        .from("jobs")
        .delete()
        .eq("id", idToDelete);

      if (error) throw error;

      setHiddenJobIds((prev) => {
        if (prev.has(String(idToDelete))) return prev;
        const next = new Set(prev);
        next.add(String(idToDelete));
        return next;
      });

      toast({
        title: "Job deleted",
        description: `${job.job_title ?? "Job"} has been removed.`,
      });

      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs-count"] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
    } catch (error: any) {
      // On failure, revalidate to restore UI state
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs-count"] });
      toast({
        title: "Error deleting job",
        description: error.message || "Could not delete job.",
        variant: "destructive",
      });
    } finally {
      setDeletingJobId(null);
    }
  };

  const visibleJobs = useMemo(() => {
    if (hiddenJobIds.size === 0) return jobs;
    return jobs.filter((job) => !hiddenJobIds.has(String(job.id)));
  }, [jobs, hiddenJobIds]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Job Descriptions</h1>
          <p className="text-muted-foreground mt-1">Manage job postings and requirements</p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md"
        >
          <Plus className="h-4 w-4 mr-2" />
          {showForm ? "Cancel" : "Add New Job"}
        </Button>
      </div>

      {showForm && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-xl">Enter Job Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveJob} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="job-title">Job Title</Label>
                  <Input
                    id="job-title"
                    name="job-title"
                    placeholder="e.g., Senior Software Engineer"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    name="department"
                    placeholder="e.g., Engineering"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Job Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Describe the role, responsibilities, and company culture..."
                  rows={5}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="skills">Required Skills (comma-separated)</Label>
                  <Input
                    id="skills"
                    name="skills"
                    placeholder="React, TypeScript, Node.js"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md w-full md:w-auto"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Job
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Existing Jobs</CardTitle>
          <p className="text-sm text-muted-foreground">All active and closed job positions</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Required Skills</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No jobs found. Create your first job posting!
                  </TableCell>
                </TableRow>
              ) : (
                visibleJobs.map((job) => (
                  <TableRow key={job.id} className="hover:bg-accent/50 transition-colors">
                    <TableCell className="font-medium">{job.job_title}</TableCell>
                    <TableCell className="text-muted-foreground">{job.department}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {job.required_skills?.map((skill, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(job)}
                          title="Edit Job"
                          disabled={deletingJobId === job.id}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive disabled:opacity-50"
                          onClick={() => handleDeleteJob(job)}
                          title="Delete Job"
                          disabled={deletingJobId === job.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Job Details</DialogTitle>
          </DialogHeader>
          <form className="space-y-6" onSubmit={handleUpdateJob}>
            <div className="space-y-2">
              <Label htmlFor="edit-job-title">Job Title</Label>
              <Input
                id="edit-job-title"
                value={editForm.job_title}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, job_title: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-department">Department</Label>
              <Input
                id="edit-department"
                value={editForm.department}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, department: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Job Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={4}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-skills">Required Skills (comma-separated)</Label>
              <Input
                id="edit-skills"
                value={editForm.required_skills}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, required_skills: e.target.value }))
                }
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-primary hover:opacity-90 text-primary-foreground">
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

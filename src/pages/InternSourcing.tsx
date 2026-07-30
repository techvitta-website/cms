import { useMemo, useState } from "react";
import { Radar, Search, Loader2, ExternalLink, Github, Globe, Linkedin, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Lead = {
  id: string;
  name: string | null;
  kind: string | null;
  source: string | null;
  url: string;
  snippet: string | null;
  location: string | null;
  college: string | null;
  skills: string[] | null;
  status: string | null;
  created_at: string | null;
};

const STATUS_OPTIONS = ["New", "Saved", "Contacted", "Imported", "Dismissed"];

const splitCsv = (s: string) =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

const kindBadge = (kind: string | null) => {
  const k = (kind || "").toLowerCase();
  if (k === "github") return "bg-slate-900 text-white border-none";
  if (k === "linkedin") return "bg-sky-100 text-sky-700 border-none";
  if (k === "portfolio") return "bg-violet-100 text-violet-700 border-none";
  return "bg-emerald-100 text-emerald-700 border-none";
};

const KindIcon = ({ kind }: { kind: string | null }) => {
  const k = (kind || "").toLowerCase();
  if (k === "github") return <Github className="h-3.5 w-3.5" />;
  if (k === "linkedin") return <Linkedin className="h-3.5 w-3.5" />;
  if (k === "portfolio") return <FileText className="h-3.5 w-3.5" />;
  return <Globe className="h-3.5 w-3.5" />;
};

const statusBadgeClass = (status: string) => {
  const k = (status || "").toLowerCase();
  if (k === "saved") return "bg-blue-100 text-blue-700 border-none";
  if (k === "contacted") return "bg-amber-100 text-amber-700 border-none";
  if (k === "imported") return "bg-emerald-100 text-emerald-700 border-none";
  if (k === "dismissed") return "bg-slate-100 text-slate-500 border-none";
  return "bg-slate-100 text-slate-700 border-none";
};

export default function InternSourcing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [colleges, setColleges] = useState("");
  const [locations, setLocations] = useState("");
  const [skills, setSkills] = useState("");
  const [useGithub, setUseGithub] = useState(true);
  const [useWeb, setUseWeb] = useState(true);
  const [limit, setLimit] = useState("30");
  const [searching, setSearching] = useState(false);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("__ALL__");
  const [statusFilter, setStatusFilter] = useState("__ALL__");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const {
    data: leads = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["sourced-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sourced_leads")
        .select("id, name, kind, source, url, snippet, location, college, skills, status, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (kindFilter !== "__ALL__" && (l.kind || "") !== kindFilter) return false;
      if (statusFilter !== "__ALL__" && (l.status || "New") !== statusFilter) return false;
      if (q) {
        const hay = `${l.name ?? ""} ${l.snippet ?? ""} ${l.location ?? ""} ${l.college ?? ""} ${(l.skills ?? []).join(" ")} ${l.url}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, query, kindFilter, statusFilter]);

  const handleSearch = async () => {
    const collegeList = splitCsv(colleges);
    const locationList = splitCsv(locations);
    const skillList = splitCsv(skills);
    if (collegeList.length === 0 && locationList.length === 0 && skillList.length === 0) {
      toast({
        title: "Add a filter",
        description: "Enter at least one college, location, or skill to search for.",
      });
      return;
    }
    if (!useGithub && !useWeb) {
      toast({ title: "Pick a source", description: "Turn on GitHub and/or Web sourcing." });
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("intern-source", {
        body: {
          colleges: collegeList,
          locations: locationList,
          skills: skillList,
          useGithub,
          useWeb,
          limit: Number(limit) || 30,
        },
      });
      if (error) throw error;
      const found = (data as any)?.found ?? 0;
      const note = (data as any)?.note as string | undefined;
      toast({
        title: found > 0 ? `Found ${found} lead(s)` : "No leads found",
        description:
          note ||
          (found > 0
            ? "Review them below and mark the ones worth reaching out to."
            : "Try broader skills or locations."),
      });
      await queryClient.invalidateQueries({ queryKey: ["sourced-leads"] });
      await refetch();
    } catch (err: any) {
      toast({
        title: "Search failed",
        description: err?.message || "The intern-source function may not be deployed yet.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const setStatus = async (lead: Lead, status: string) => {
    setUpdatingId(lead.id);
    try {
      const { error } = await supabase.from("sourced_leads").update({ status }).eq("id", lead.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["sourced-leads"] });
      await refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not update status.", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-md">
          <Radar className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Source Interns</h1>
          <p className="text-muted-foreground mt-1">
            Discover public candidate leads by college, location and skills — GitHub profiles, portfolios and public resumes.
          </p>
        </div>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Search className="h-5 w-5" /> Find candidates
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter what you're looking for. GitHub search needs no setup. Public resume / portfolio search runs when a
            search-API key is configured on the server.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="skills">Skills (comma-separated)</Label>
              <Input
                id="skills"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="react, python, java"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locations">Locations (comma-separated)</Label>
              <Input
                id="locations"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="Hyderabad, Bengaluru"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="colleges">Colleges (comma-separated)</Label>
              <Input
                id="colleges"
                value={colleges}
                onChange={(e) => setColleges(e.target.value)}
                placeholder="IIT Hyderabad, VIT"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch id="use-github" checked={useGithub} onCheckedChange={setUseGithub} />
              <Label htmlFor="use-github" className="flex items-center gap-1.5 cursor-pointer">
                <Github className="h-4 w-4" /> GitHub developers
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="use-web" checked={useWeb} onCheckedChange={setUseWeb} />
              <Label htmlFor="use-web" className="flex items-center gap-1.5 cursor-pointer">
                <Globe className="h-4 w-4" /> Public web / resumes
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="limit" className="text-sm text-muted-foreground">Max results</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="limit" className="w-24 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["15", "30", "45", "60"].map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleSearch}
            disabled={searching}
            className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md"
          >
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching…
              </>
            ) : (
              <>
                <Radar className="h-4 w-4 mr-2" /> Find candidates
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Candidate leads</CardTitle>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {leads.length} lead(s). These are public profiles to review and reach out to — not applications.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search leads…"
                className="pl-8"
              />
            </div>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All sources</SelectItem>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="portfolio">Portfolio</SelectItem>
                <SelectItem value="web">Web / resume</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Location / College</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No leads yet. Run a search above to discover candidates.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((l) => {
                    const status = l.status || "New";
                    return (
                      <TableRow key={l.id} className="hover:bg-accent/50 transition-colors">
                        <TableCell className="max-w-[320px]">
                          <div className="font-medium">{l.name || l.url}</div>
                          {l.snippet && (
                            <div className="text-xs text-muted-foreground line-clamp-2">{l.snippet}</div>
                          )}
                          {l.skills && l.skills.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {l.skills.slice(0, 6).map((s) => (
                                <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{s}</span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`gap-1 ${kindBadge(l.kind)}`}>
                            <KindIcon kind={l.kind} />
                            {l.kind || "web"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {[l.location, l.college].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={status}
                            onValueChange={(v) => setStatus(l, v)}
                            disabled={updatingId === l.id}
                          >
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue>
                                <Badge className={statusBadgeClass(status)}>{status}</Badge>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(l.url, "_blank", "noopener,noreferrer")}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" /> Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

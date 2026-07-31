import { Briefcase, ListFilter, ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Sort options shared by the pipeline pages (Shortlist / Interview / Feedback).
export type CandidateSort = "date-desc" | "date-asc" | "name-asc" | "name-desc";

// Minimal shape the filter/sort helper needs from a candidate record.
export interface FilterableCandidate {
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at?: string | null;
  jobs?: { job_title: string } | null;
}

// Build the de-duplicated, sorted list of job titles present in a candidate list.
export function jobOptionsFrom(list: FilterableCandidate[]): string[] {
  const titles = new Set<string>();
  list.forEach((c) => {
    const title = c.jobs?.job_title?.trim();
    if (title) titles.add(title);
  });
  return Array.from(titles).sort((a, b) => a.localeCompare(b));
}

// Build the de-duplicated, sorted list of statuses present in a candidate list.
export function statusOptionsFrom(list: FilterableCandidate[]): string[] {
  const statuses = new Set<string>();
  list.forEach((c) => {
    if (c.status) statuses.add(c.status);
  });
  return Array.from(statuses).sort((a, b) => a.localeCompare(b));
}

// Apply the search term, the job filter, the status filter and the chosen sort
// to a candidate list. Every pipeline page runs its list through this so the
// filtering behaviour stays identical across pages.
export function filterAndSortCandidates<T extends FilterableCandidate>(
  list: T[],
  opts: {
    searchTerm: string;
    jobFilter: string;
    statusFilter?: string;
    sort: CandidateSort;
    dateField?: (c: T) => string | null | undefined;
  },
): T[] {
  const { searchTerm, jobFilter, statusFilter, sort, dateField } = opts;
  const searchLower = searchTerm.trim().toLowerCase();

  const filtered = list.filter((c) => {
    if (searchLower) {
      const nameMatch = c.full_name?.toLowerCase().includes(searchLower);
      const emailMatch = c.email?.toLowerCase().includes(searchLower);
      const phoneMatch = c.phone?.toLowerCase().includes(searchLower);
      const jobMatch = c.jobs?.job_title?.toLowerCase().includes(searchLower);
      if (!nameMatch && !emailMatch && !phoneMatch && !jobMatch) return false;
    }
    if (jobFilter && jobFilter !== "all" && (c.jobs?.job_title || "") !== jobFilter) {
      return false;
    }
    if (statusFilter && statusFilter !== "all" && c.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const getDate = (c: T) => (dateField ? dateField(c) : c.created_at);

  return [...filtered].sort((a, b) => {
    switch (sort) {
      case "name-asc":
        return (a.full_name || "").localeCompare(b.full_name || "");
      case "name-desc":
        return (b.full_name || "").localeCompare(a.full_name || "");
      case "date-asc":
        return new Date(getDate(a) || 0).getTime() - new Date(getDate(b) || 0).getTime();
      case "date-desc":
      default:
        return new Date(getDate(b) || 0).getTime() - new Date(getDate(a) || 0).getTime();
    }
  });
}

interface CandidateFilterBarProps {
  jobOptions: string[];
  jobFilter: string;
  onJobChange: (value: string) => void;
  sort: CandidateSort;
  onSortChange: (value: CandidateSort) => void;
  // Status filter is optional — pages that only ever show a single status can
  // omit it. When provided, the dropdown lists exactly the statuses present.
  statusOptions?: string[];
  statusFilter?: string;
  onStatusChange?: (value: string) => void;
}

// A compact, single-row filter bar: Filter by Job, Filter by Status, and Sort.
export default function CandidateFilterBar({
  jobOptions,
  jobFilter,
  onJobChange,
  sort,
  onSortChange,
  statusOptions,
  statusFilter,
  onStatusChange,
}: CandidateFilterBarProps) {
  const showStatus =
    statusOptions !== undefined && statusFilter !== undefined && onStatusChange !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Briefcase className="h-4 w-4 text-muted-foreground" />
        <Select value={jobFilter} onValueChange={onJobChange}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue placeholder="All jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            {jobOptions.map((job) => (
              <SelectItem key={job} value={job}>
                {job}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showStatus && (
        <div className="flex items-center gap-1.5">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions!.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <Select value={sort} onValueChange={(value) => onSortChange(value as CandidateSort)}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest first</SelectItem>
            <SelectItem value="date-asc">Oldest first</SelectItem>
            <SelectItem value="name-asc">Name A–Z</SelectItem>
            <SelectItem value="name-desc">Name Z–A</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

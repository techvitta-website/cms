import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ExcelColumnFilterProps {
  /** Column header text. */
  label: string;
  /** Every distinct value present in this column (unfiltered). */
  values: string[];
  /** Currently selected values; null = no filter (all values pass). */
  selected: Set<string> | null;
  onChange: (selected: Set<string> | null) => void;
}

/**
 * Excel-style column filter: a funnel button in the column header opening a
 * searchable checklist of the column's distinct values, with Select all /
 * Clear. null selection = column unfiltered. Reusable on any table.
 */
export default function ExcelColumnFilter({ label, values, selected, onChange }: ExcelColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const distinct = useMemo(() => {
    const set = new Set(values.map((v) => (v && v.trim() ? v : "—")));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [values]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? distinct.filter((v) => v.toLowerCase().includes(q)) : distinct;
  }, [distinct, search]);

  const active = selected !== null;

  const toggle = (value: string) => {
    const base = selected ? new Set(selected) : new Set(distinct);
    if (base.has(value)) base.delete(value);
    else base.add(value);
    // Everything selected again = no filter.
    onChange(base.size === distinct.length ? null : base);
  };

  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${active ? "text-primary" : "text-muted-foreground/60 hover:text-foreground"}`}
            title={`Filter ${label}`}
          >
            <Filter className={`h-3.5 w-3.5 ${active ? "fill-primary/20" : ""}`} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-2" align="start">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="h-8 mb-2 text-xs"
          />
          <div className="flex items-center justify-between px-1 pb-1 text-xs">
            <button className="text-primary hover:underline" onClick={() => onChange(null)}>
              Select all
            </button>
            <button className="text-primary hover:underline" onClick={() => onChange(new Set<string>())}>
              Clear
            </button>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {shown.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">No values match.</p>
            ) : (
              shown.map((v) => {
                const checked = selected === null || selected.has(v);
                return (
                  <label
                    key={v}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(v)} className="h-3.5 w-3.5" />
                    <span className="truncate" title={v}>{v}</span>
                  </label>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}

/** Apply a set of column filters ({key: selected-or-null}) to rows via a value accessor. */
export function applyColumnFilters<T>(
  rows: T[],
  filters: Record<string, Set<string> | null>,
  valueOf: (row: T, key: string) => string,
): T[] {
  const activeKeys = Object.keys(filters).filter((k) => filters[k] !== null);
  if (activeKeys.length === 0) return rows;
  return rows.filter((row) =>
    activeKeys.every((k) => {
      const raw = valueOf(row, k);
      const v = raw && raw.trim() ? raw : "—";
      return filters[k]!.has(v);
    }),
  );
}

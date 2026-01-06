import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CandidateCardProps {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  resumeUrl: string | null;
  appliedJob?: string | null;
  status?: string;
  onViewResume?: () => void;
  children?: React.ReactNode;
}

export default function CandidateCard({
  id,
  fullName,
  email,
  phone,
  resumeUrl,
  appliedJob,
  status,
  onViewResume,
  children,
}: CandidateCardProps) {
  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const statusColors: Record<string, string> = {
      Pending: "bg-yellow-100 text-yellow-800",
      Shortlisted: "bg-blue-100 text-blue-800",
      Rejected: "bg-red-100 text-red-800",
      Approved: "bg-green-100 text-green-800",
    };
    return (
      <Badge className={statusColors[status] || "bg-gray-100 text-gray-800"}>
        {status}
      </Badge>
    );
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1 sm:mb-0">
              <h3 className="text-base sm:text-lg font-semibold text-foreground truncate flex-1">
                {fullName}
              </h3>
              {status && (
                <div className="sm:hidden flex-shrink-0">
                  {getStatusBadge(status)}
                </div>
              )}
            </div>
            <div className="space-y-1 text-xs sm:text-sm text-muted-foreground">
              <p className="break-words sm:truncate">
                <span className="font-medium">Email:</span> {email}
              </p>
              {phone && (
                <p className="break-words sm:truncate">
                  <span className="font-medium">Phone:</span> {phone}
                </p>
              )}
              {appliedJob && (
                <p className="break-words sm:truncate">
                  <span className="font-medium">Applied Job:</span> {appliedJob}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 flex-shrink-0 w-full sm:w-auto">
            {status && (
              <div className="hidden sm:block">
                {getStatusBadge(status)}
              </div>
            )}
            {resumeUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={onViewResume}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">View Resume</span>
                <span className="sm:hidden">Resume</span>
              </Button>
            )}
          </div>
        </div>
        {children && <div className="mt-4">{children}</div>}
      </CardContent>
    </Card>
  );
}


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
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground mb-1 truncate">
              {fullName}
            </h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="truncate">
                <span className="font-medium">Email:</span> {email}
              </p>
              {phone && (
                <p className="truncate">
                  <span className="font-medium">Phone:</span> {phone}
                </p>
              )}
              {appliedJob && (
                <p className="truncate">
                  <span className="font-medium">Applied Job:</span> {appliedJob}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {status && getStatusBadge(status)}
            {resumeUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={onViewResume}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View Resume
              </Button>
            )}
          </div>
        </div>
        {children && <div className="mt-4">{children}</div>}
      </CardContent>
    </Card>
  );
}


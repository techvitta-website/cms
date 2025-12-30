import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, AlertCircle, Info } from "lucide-react";

export default function UploadDocumentsLanding() {
  const navigate = useNavigate();
  const [candidateId, setCandidateId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!candidateId.trim()) {
      setError("Please enter your Candidate ID");
      return;
    }

    // Basic UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(candidateId.trim())) {
      setError("Invalid Candidate ID format. Please check your ID and try again.");
      return;
    }

    navigate(`/${candidateId.trim()}/upload-documents`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Upload className="h-6 w-6 text-primary" />
            Document Upload Portal
          </CardTitle>
          <CardDescription>
            Enter your Candidate ID to upload required documents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Your Candidate ID was provided in the email from HR. It's a unique identifier in the format: 
              <code className="block mt-1 text-xs bg-muted p-1 rounded">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</code>
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="candidateId">Candidate ID</Label>
              <Input
                id="candidateId"
                type="text"
                placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
                value={candidateId}
                onChange={(e) => {
                  setCandidateId(e.target.value);
                  setError("");
                }}
                className="font-mono text-sm"
              />
              {error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {error}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground"
              size="lg"
            >
              Continue to Upload Documents
            </Button>
          </form>

          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground text-center">
              If you don't have your Candidate ID, please contact HR for assistance.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

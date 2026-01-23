import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

export default function PublicCandidateForm() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    jobId: "",
    customJobTitle: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Fetch all jobs for dropdown
  const { data: jobs = [] } = useQuery({
    queryKey: ['public-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_title')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  const computeFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!/\.pdf$/i.test(file.name)) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF file only.",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "File size must be less than 10MB.",
          variant: "destructive",
        });
        return;
      }
      setResumeFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validate required fields
    if (!formData.name.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter your full name.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!formData.email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Validate email format
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    if (!emailRegex.test(formData.email.trim())) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Validate phone number (required)
    if (!formData.phone.trim()) {
      toast({
        title: "Phone Number Required",
        description: "Please enter your phone number.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Validate resume file (required)
    if (!resumeFile) {
      toast({
        title: "Resume Required",
        description: "Please upload your resume (PDF file).",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Validate job selection (required)
    if (!formData.jobId || formData.jobId === "none") {
      toast({
        title: "Job Selection Required",
        description: "Please select a job position you're applying for.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Validate custom job title if "Other" is selected
    if (formData.jobId === "other" && !formData.customJobTitle.trim()) {
      toast({
        title: "Job Title Required",
        description: "Please enter the job title you're applying for.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      // Upload resume file (required)
      const resumeHash = await computeFileHash(resumeFile!);
      let resumeUrl: string = "";
      let usedBucket: string = "";

        // Check if file already exists
        const { data: existingCandidate } = await supabase
          .from("candidates")
          .select("id, full_name")
          .eq("resume_hash", resumeHash)
          .maybeSingle();

        if (existingCandidate) {
          toast({
            title: "Resume Already Exists",
            description: `This resume matches ${existingCandidate.full_name}'s existing resume.`,
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }

        // Upload to storage
        const envBucket = (import.meta as any).env?.VITE_SUPABASE_RESUMES_BUCKET || "resumes-private";
        const candidateBuckets = Array.from(new Set([envBucket, "resumes-private", "resumes"]));

        const timestamp = Date.now();
        const sanitizedFileName = resumeFile!.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const storageFileName = `${timestamp}_0_${sanitizedFileName}`;

        let uploaded = false;

        for (const BUCKET_NAME of candidateBuckets) {
          const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storageFileName, resumeFile!, {
              cacheControl: "3600",
              upsert: false,
              metadata: { file_hash: resumeHash, original_name: resumeFile.name },
            });

          if (!uploadError) {
            uploaded = true;
            usedBucket = BUCKET_NAME;
            resumeUrl = `${BUCKET_NAME}/${storageFileName}`;
            break;
          }
        }

        if (!uploaded) {
          toast({
            title: "Upload Failed",
            description: "Failed to upload resume file. Please try again.",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }

        // Record hash (ignore errors if hash already exists)
        try {
          const { error: hashError } = await supabase
            .from("resume_upload_hashes")
            .insert({ file_hash: resumeHash, original_name: resumeFile.name });
          
          if (hashError && hashError.code !== "23505") {
            // Only log if it's not a duplicate key error
            console.warn("Failed to record hash:", hashError);
          }
        } catch (hashErr) {
          // Ignore hash recording errors
          console.warn("Hash recording error:", hashErr);
        }

      // Trigger processing
      try {
        const baseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
        if (baseUrl) {
          const eventUrl = `${baseUrl}/functions/v1/ats-processor/event`;
          await fetch(eventUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket: usedBucket, name: storageFileName }),
          }).catch(() => undefined);
        }
      } catch (e) {
        console.warn("Could not notify event endpoint:", e);
      }

      // Handle custom job title - create job if "other" is selected
      let finalJobId = formData.jobId;
      if (formData.jobId === "other" && formData.customJobTitle.trim()) {
        // Create a new job entry for the custom job title
        const { data: newJob, error: jobError } = await supabase
          .from('jobs')
          .insert({
            job_title: formData.customJobTitle.trim(),
          })
          .select('id')
          .single();
        
        if (jobError) {
          throw new Error(`Failed to create job: ${jobError.message}`);
        }
        finalJobId = newJob.id;
      }

      // Create candidate record
      const { error: insertError } = await supabase
        .from("candidates")
        .insert({
          full_name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          status: "Pending",
          resume_url: resumeUrl!,
          resume_hash: resumeHash!,
          resume_processed: false,
          job_id: finalJobId,
          reference_source: "Public Form",
        });

      if (insertError) {
        // Check if it's a duplicate email error
        if (insertError.code === "23505" && insertError.message.includes("email")) {
          // Handle custom job title for update
          let finalJobIdForUpdate = formData.jobId;
          if (formData.jobId === "other" && formData.customJobTitle.trim()) {
            // Create a new job entry for the custom job title
            const { data: newJob, error: jobError } = await supabase
              .from('jobs')
              .insert({
                job_title: formData.customJobTitle.trim(),
              })
              .select('id')
              .single();
            
            if (jobError) {
              throw new Error(`Failed to create job: ${jobError.message}`);
            }
            finalJobIdForUpdate = newJob.id;
          }

          // Try to update existing candidate
          const { error: updateError } = await supabase
            .from("candidates")
            .update({
              full_name: formData.name.trim(),
              phone: formData.phone.trim(),
              resume_url: resumeUrl!,
              resume_hash: resumeHash!,
              resume_processed: false,
              job_id: finalJobIdForUpdate,
              reference_source: "Public Form",
            })
            .eq("email", formData.email.trim().toLowerCase());

          if (updateError) {
            throw updateError;
          }

          toast({
            title: "Application Updated",
            description: "Your information has been updated successfully.",
          });
        } else {
          throw insertError;
        }
      } else {
        toast({
          title: "Application Submitted",
          description: "Thank you! Your application has been submitted successfully.",
        });
      }

      // Reset form
      setFormData({
        name: "",
        email: "",
        phone: "",
        jobId: "",
        customJobTitle: "",
      });
      setResumeFile(null);
      setSubmitSuccess(true);

      // Reset success message after 5 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
    } catch (error: any) {
      console.error("Error submitting application:", error);
      toast({
        title: "Submission Error",
        description: error.message || "Failed to submit application. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Single Card with everything */}
        <Card className="bg-gray-900 border border-gray-700 shadow-2xl">
          {/* Blue Header Banner */}
          <div className="bg-blue-600 px-8 py-6 rounded-t-lg flex items-center gap-4">
            {/* Logo in circle */}
            <div className="flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-white p-2 flex items-center justify-center overflow-hidden">
                <img
                  src="https://res.cloudinary.com/ddw4avyim/image/upload/v1763711488/WhatsApp_Image_2025-11-21_at_13.20.07_d46f25ce_h7bnay.jpg"
                  alt="Tech Vitta Innovations Logo"
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
            </div>
            {/* Title Section */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-1">Apply Now</h1>
              <p className="text-blue-100">Submit your application and resume.</p>
            </div>
          </div>

          <CardContent className="p-8">
            {/* Instructions Box */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
              <p className="text-gray-200 text-center leading-relaxed">
                Interested in joining our team? Fill out the form below and upload your resume. We review every application and will get back to you soon!
              </p>
            </div>
            {submitSuccess ? (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Your application has been submitted successfully! We'll review your profile and get back to you soon.
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-700 font-medium">
                    Full Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-700 font-medium">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-gray-700 font-medium">
                    Phone Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Enter your phone number"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </div>

                {/* Job Applied */}
                <div className="space-y-2">
                  <Label htmlFor="job" className="text-gray-700 font-medium">
                    Job Applied For <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.jobId || undefined}
                    onValueChange={(value) => setFormData({ ...formData, jobId: value, customJobTitle: value === "other" ? formData.customJobTitle : "" })}
                    disabled={isSubmitting}
                    required
                  >
                    <SelectTrigger id="job" className="h-11">
                      <SelectValue placeholder="Select a job position" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map((job: any) => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.job_title}
                        </SelectItem>
                      ))}
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Custom Job Title Input - Show when "Other" is selected */}
                  {formData.jobId === "other" && (
                    <div className="mt-3">
                      <Label htmlFor="customJobTitle" className="text-gray-700 font-medium">
                        Enter Job Title <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="customJobTitle"
                        type="text"
                        placeholder="Enter the job title you're applying for"
                        value={formData.customJobTitle}
                        onChange={(e) => setFormData({ ...formData, customJobTitle: e.target.value })}
                        required
                        disabled={isSubmitting}
                        className="h-11 mt-2"
                      />
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.jobId === "other" 
                      ? "Please enter the job title you're applying for"
                      : "Please select the job position you're applying for"}
                  </p>
                </div>

                {/* Resume Upload */}
                <div className="space-y-2">
                  <Label htmlFor="resume" className="text-gray-700 font-medium">
                    Resume (PDF) <span className="text-red-500">*</span>
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors duration-200 bg-gray-50">
                    <input
                      id="resume"
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="hidden"
                      required
                      disabled={isSubmitting}
                    />
                    <label htmlFor="resume" className="cursor-pointer flex flex-col items-center gap-3">
                      {resumeFile ? (
                        <>
                          <CheckCircle className="h-10 w-10 text-green-600" />
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-medium text-gray-900">{resumeFile.name}</span>
                            <span className="text-xs text-gray-500">
                              {(resumeFile.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-blue-600" />
                            <span className="text-base font-medium text-blue-600 hover:text-blue-700">
                              Choose Resume File
                            </span>
                          </div>
                        </>
                      )}
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Max file size: 10MB. PDF format required.
                  </p>
                </div>

                {/* Submit Button */}
                <div className="pt-4">
                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base font-semibold"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Application"
                    )}
                  </Button>
                </div>

                {/* Info Message */}
                <p className="text-sm text-gray-600 text-center pt-2">
                  Once you submit your application, our HR team will review it and contact you within 2-3 business days.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


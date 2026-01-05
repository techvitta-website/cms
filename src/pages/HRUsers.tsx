import { useState } from "react";
import { UserPlus } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export default function HRUsers() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch HR users
  const { data: hrUsers = [] } = useQuery({
    queryKey: ['hr-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const selectedRole = role || 'hr';

    if (!name || !email || !password || !selectedRole) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Step 1: Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            name: name,
            role: selectedRole,
          }
        }
      });

      if (authError) {
        // If user already exists, try to sign in to get the user ID
        if (authError.message.includes('already registered')) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password,
          });

          if (signInError) {
            throw new Error(`User exists but password is incorrect. ${authError.message}`);
          }

          // Use existing user
          if (signInData.user) {
            // Step 2: Create or update hr_users record
            const { error: hrError } = await supabase
              .from('hr_users')
              .upsert({
                id: signInData.user.id,
                name: name.trim(),
                email: email.trim().toLowerCase(),
                role: selectedRole,
                password: null, // Don't store password in plain text
              }, {
                onConflict: 'email'
              });

            if (hrError) throw hrError;

            // Sign out after creating the record
            await supabase.auth.signOut();

            toast({
              title: "HR member added successfully!",
              description: "The new team member has been added to the system. They can now login.",
            });
          }
        } else {
          throw authError;
        }
      } else if (authData.user) {
        // Step 2: Create hr_users record with auth user ID
        const { error: hrError } = await supabase
          .from('hr_users')
          .insert({
            id: authData.user.id,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role: selectedRole,
            password: null, // Don't store password in plain text
          });

        if (hrError) {
          // If hr_users insert fails, try to clean up auth user
          console.error('Failed to create hr_users record:', hrError);
          throw new Error(`Failed to create HR user record: ${hrError.message}`);
        }

        toast({
          title: "HR member added successfully!",
          description: "The new team member has been added to the system. They will receive a confirmation email to activate their account.",
        });
      }

      queryClient.invalidateQueries({ queryKey: ['hr-users'] });
      setOpen(false);
      setRole("");
      
      // Reset form
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      toast({
        title: "Error adding HR member",
        description: error.message || "Failed to add HR member. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === "Admin") return <Badge className="bg-primary text-primary-foreground">{role}</Badge>;
    if (role === "Manager") return <Badge className="bg-success text-success-foreground">{role}</Badge>;
    return <Badge variant="secondary">{role}</Badge>;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">HR Team Members</h1>
          <p className="text-muted-foreground mt-1">Manage your HR department users and permissions</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md">
              <UserPlus className="h-4 w-4 mr-2" />
              Add HR Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-xl">Add New HR Member</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" name="name" placeholder="John Doe" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="john.doe@company.com" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" placeholder="••••••••" required minLength={6} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={role} onValueChange={setRole} required>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select a role..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md w-full"
              >
                Add Member
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Team Directory</CardTitle>
          <p className="text-sm text-muted-foreground">All HR department members and their roles</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Created Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hrUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No HR users found
                  </TableCell>
                </TableRow>
              ) : (
                hrUsers.map((user) => (
                  <TableRow key={user.id} className="hover:bg-accent/50 transition-colors">
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { UserPlus, Pencil, KeyRound, Trash2, Loader2 } from "lucide-react";
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
  DialogDescription,
  DialogFooter,
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
import { useAuth } from "@/context/AuthContext";
import { canResetPassword, isAdmin } from "@/lib/roles";

export default function HRUsers() {
  const { hrUser: currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [role, setRole] = useState("");
  const [editRole, setEditRole] = useState("");
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch HR users
  const { data: hrUsers = [] } = useQuery({
    queryKey: ['hr-users'],
    queryFn: async () => {
      // Named columns only — never select('*') here: hr_users has a legacy
      // password column that must not be shipped to the browser.
      const { data, error } = await supabase
        .from('hr_users')
        .select('id, name, email, role, created_at')
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

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const formData = new FormData(e.target as HTMLFormElement);
    const name = formData.get('edit-name') as string;
    const email = formData.get('edit-email') as string;
    const selectedRole = editRole || editingUser.role || 'hr';

    if (!name || !email || !selectedRole) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Update hr_users record
      const { error: updateError } = await supabase
        .from('hr_users')
        .update({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: selectedRole,
        })
        .eq('id', editingUser.id);

      if (updateError) {
        throw updateError;
      }

      // Update auth user metadata if email changed
      if (email.trim().toLowerCase() !== editingUser.email) {
        // Note: Email change in auth requires admin privileges or special handling
        // For now, we'll just update the hr_users table
        console.log('Email changed - auth update may be required');
      }

      toast({
        title: "HR member updated successfully!",
        description: "The team member's information has been updated.",
      });

      queryClient.invalidateQueries({ queryKey: ['hr-users'] });
      setEditOpen(false);
      setEditingUser(null);
      setEditRole("");
      
      // Reset form
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      toast({
        title: "Error updating HR member",
        description: error.message || "Failed to update HR member. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleOpenEdit = (user: any) => {
    setEditingUser(user);
    setEditRole(user.role || 'hr');
    setEditOpen(true);
  };

  // Password reset handler (Admin only, for HR role users)
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;

    if (!newPassword || !confirmPassword) {
      toast({
        title: "Validation Error",
        description: "Please fill in both password fields.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "New password and confirm password must match.",
        variant: "destructive",
      });
      return;
    }

    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-hr-password', {
        body: {
          userId: resettingUser.id,
          newPassword: newPassword,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to reset password');
      }

      toast({
        title: "Password Reset Successful",
        description: `Password has been reset for ${resettingUser.name}.`,
      });

      setResetPasswordOpen(false);
      setResettingUser(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "Password Reset Failed",
        description: error.message || "Failed to reset password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  const handleOpenResetPassword = (user: any) => {
    setResettingUser(user);
    setResetPasswordOpen(true);
  };

  // Delete an HR user's login access entirely (Admin only). The edge function
  // removes both the hr_users row and the Supabase Auth account (service role),
  // so the user can no longer sign in to this app or the SSO hub.
  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-hr-user', {
        body: { userId: deletingUser.id },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to delete user');
      }

      toast({
        title: "User deleted",
        description: `${deletingUser.name} has been removed and can no longer log in.`,
      });

      queryClient.invalidateQueries({ queryKey: ['hr-users'] });
      setDeletingUser(null);
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete user. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === "admin") return <Badge className="bg-primary text-primary-foreground">Admin</Badge>;
    return <Badge variant="secondary">{role || 'hr'}</Badge>;
  };

  const canReset = canResetPassword(currentUser); // Only admin can reset
  const canAddHR = isAdmin(currentUser); // Only admin can add HR members
  const userIsAdmin = isAdmin(currentUser); // Only admin can edit users/roles

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">HR Team Members</h1>
          <p className="text-muted-foreground mt-1">Manage your HR department users and permissions</p>
        </div>
        
        {canAddHR && (
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
                    <SelectItem value="hr">HR</SelectItem>
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
        )}
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hrUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Editing users (incl. role changes) is admin-only.
                            This was unconditional, which let an HR user open
                            the dialog and set their own role to admin. */}
                        {userIsAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(user)}
                            className="h-8 w-8 p-0"
                            title="Edit User"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Password Reset Button - Only for Admin, only for HR role users */}
                        {canReset && user.role?.toLowerCase() === 'hr' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenResetPassword(user)}
                            className="h-8 w-8 p-0"
                            title="Reset Password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Delete Button - Admin only. Hidden on your own row so
                            you can't lock yourself out (the edge function also
                            blocks self-delete as a safeguard). */}
                        {userIsAdmin && user.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingUser(user)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete User"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit HR User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Edit HR Member</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={handleEditUser} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input 
                  id="edit-name" 
                  name="edit-name" 
                  placeholder="John Doe" 
                  defaultValue={editingUser.name}
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input 
                  id="edit-email" 
                  name="edit-email" 
                  type="email" 
                  placeholder="john.doe@company.com" 
                  defaultValue={editingUser.email}
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select value={editRole} onValueChange={setEditRole} required>
                  <SelectTrigger id="edit-role">
                    <SelectValue placeholder="Select a role..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditOpen(false);
                    setEditingUser(null);
                    setEditRole("");
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md flex-1"
                >
                  Update Member
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog - Only visible to Admin, only for HR role users */}
      {canReset && (
        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-xl">Reset Password</DialogTitle>
            </DialogHeader>
            {resettingUser && (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Resetting password for:</p>
                  <p className="text-lg font-semibold">{resettingUser.name}</p>
                  <p className="text-sm text-muted-foreground">{resettingUser.email}</p>
                  <Badge variant="secondary" className="mt-2">{resettingUser.role || 'hr'}</Badge>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setResetPasswordOpen(false);
                      setResettingUser(null);
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="flex-1"
                    disabled={resetting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-md flex-1"
                    disabled={resetting}
                  >
                    {resetting ? "Resetting..." : "Reset Password"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete HR User Confirmation - Admin only */}
      {userIsAdmin && (
        <Dialog
          open={!!deletingUser}
          onOpenChange={(open) => !open && !deleting && setDeletingUser(null)}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-xl">Delete {deletingUser?.name}?</DialogTitle>
              <DialogDescription>
                This permanently removes their login access. They will be deleted from this
                app and can no longer sign in here or through the SSO hub. This action cannot
                be undone.
              </DialogDescription>
            </DialogHeader>
            {deletingUser && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-lg font-semibold">{deletingUser.name}</p>
                <p className="text-sm text-muted-foreground">{deletingUser.email}</p>
                <Badge variant="secondary" className="mt-2">{deletingUser.role || 'hr'}</Badge>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingUser(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteUser}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete User
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

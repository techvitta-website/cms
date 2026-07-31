import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

// Password-reset landing page. Supabase sends the recovery link here (see
// Login.tsx handleForgotPassword -> redirectTo /reset-password). The recovery
// token in the URL is turned into a session automatically by the Supabase
// client, so the user just sets a new password.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // A recovery link establishes a temporary session; confirm we have one.
    supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updErr) {
      setError(updErr.message || "Could not update password.");
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/login", { replace: true }), 1800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <Card className="w-full max-w-md border-none shadow-xl bg-slate-950/70 backdrop-blur">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto size-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
            <ShieldCheck className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl text-slate-50">Set a new password</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="text-center text-emerald-400 text-sm">
              Password updated. Redirecting you to sign in…
            </p>
          ) : !ready ? (
            <p className="text-center text-slate-300 text-sm">
              This page opens from the reset link in your email. If you got here another way,
              request a new link from the sign-in page.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw" className="text-slate-200">New password</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password" required className="bg-slate-900 border-slate-700 text-slate-100" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpw" className="text-slate-200">Confirm password</Label>
                <Input id="cpw" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password" required className="bg-slate-900 border-slate-700 text-slate-100" />
              </div>
              {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
              <Button type="submit" disabled={saving} className="w-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

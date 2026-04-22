import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MotivaLogo } from "@/components/MotivaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, LogOut, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

const Settings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name, email")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setName(data.name || "");
          setEmail(data.email || user.email || "");
        }
      });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
    setLoading(false);
    if (error) toast.error("Could not save");
    else toast.success("Saved 💙");
  };

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-card hover:bg-accent flex items-center justify-center shadow-soft"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <MotivaLogo size="md" />
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8">Settings</h1>

        <div className="bg-card rounded-3xl shadow-card p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg">{name || "Friend"}</h2>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold tracking-wider text-foreground uppercase">
              Display Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold tracking-wider text-foreground uppercase">
              Email
            </label>
            <Input value={email} disabled className="h-12 rounded-2xl bg-muted" />
          </div>

          <Button
            onClick={save}
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-gradient-cta text-primary-foreground font-semibold shadow-soft"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>

        <button
          onClick={signOut}
          className="w-full mt-6 flex items-center justify-center gap-2 py-4 rounded-2xl bg-card text-destructive font-semibold shadow-soft hover:bg-destructive/5 transition-smooth"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
};

export default Settings;

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MotivaLogo } from "@/components/MotivaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Save, LogOut, User as UserIcon, Camera, Mail, Lock,
  Bell, Moon, Volume2, Loader2, Shield, Sparkles, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

interface Prefs {
  notifications_enabled: boolean;
  daily_checkins_enabled: boolean;
  sound_enabled: boolean;
  dark_mode: boolean;
}

const SettingsPage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [prefs, setPrefs] = useState<Prefs>({
    notifications_enabled: true,
    daily_checkins_enabled: true,
    sound_enabled: false,
    dark_mode: false,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("name, email, avatar_url, notifications_enabled, daily_checkins_enabled, sound_enabled, dark_mode")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setName(data.name || "");
        setEmail(data.email || user.email || "");
        setAvatarUrl(data.avatar_url || null);
        setPrefs({
          notifications_enabled: data.notifications_enabled ?? true,
          daily_checkins_enabled: data.daily_checkins_enabled ?? true,
          sound_enabled: data.sound_enabled ?? false,
          dark_mode: data.dark_mode ?? false,
        });
        if (data.dark_mode) document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
      } else {
        setEmail(user.email || "");
      }
      setLoading(false);
    })();
  }, [user]);

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return toast.error("Use JPG, PNG or WEBP");
    if (file.size > MAX_AVATAR_BYTES) return toast.error("Image must be under 5MB");

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = data.publicUrl;
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (dbErr) throw dbErr;
      setAvatarUrl(url);
      toast.success("Photo updated");
    } catch (err) {
      console.error(err);
      toast.error("Could not upload photo");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    if (!name.trim()) return toast.error("Name cannot be empty");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ name: name.trim() }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error("Could not save");
    else toast.success("Profile saved 💙");
  };

  const updatePref = async (key: keyof Prefs, value: boolean) => {
    if (!user) return;
    setPrefs((p) => ({ ...p, [key]: value }));
    if (key === "dark_mode") {
      if (value) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    }
    const { error } = await supabase.from("profiles").update({ [key]: value } as any).eq("id", user.id);
    if (error) toast.error("Could not save preference");
  };

  const changePassword = async () => {
    if (newPwd.length < 8) return toast.error("Password must be at least 8 characters");
    if (newPwd !== confirmPwd) return toast.error("Passwords do not match");
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setChangingPwd(false);
    if (error) return toast.error(error.message);
    setNewPwd("");
    setConfirmPwd("");
    toast.success("Password updated");
  };

  const initials = (name || email || "U").trim().slice(0, 1).toUpperCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-chat flex items-center justify-center text-muted-foreground">
        <Sparkles className="w-5 h-5 mr-2 animate-pulse" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chat">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/85 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center transition-smooth"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <MotivaLogo size="sm" />
          <div className="ml-2">
            <h1 className="font-display text-lg font-bold text-foreground leading-tight">Settings</h1>
            <p className="text-[11px] text-muted-foreground">Manage your profile & preferences</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-6">
        {/* PROFILE */}
        <Section icon={UserIcon} title="Profile" description="Your public identity within Motiva">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-primary flex items-center justify-center text-3xl font-display font-bold text-primary-foreground overflow-hidden ring-4 ring-card shadow-card">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-foreground/50 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-primary-foreground animate-spin" />
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-soft hover:opacity-90 transition-smooth disabled:opacity-60"
                aria-label="Change photo"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>

            <div className="flex-1 w-full space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Display Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="Your name"
                  className="h-11 rounded-xl"
                />
              </div>
              <Button
                onClick={saveProfile}
                disabled={saving}
                className="rounded-full bg-gradient-cta text-primary-foreground font-semibold shadow-soft"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </Section>

        {/* ACCOUNT */}
        <Section icon={Mail} title="Account" description="Email associated with your account">
          <div className="space-y-2">
            <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Email</label>
            <Input value={email} disabled className="h-11 rounded-xl bg-muted" />
            <p className="text-[11px] text-muted-foreground">Email changes are managed by your authentication provider.</p>
          </div>
        </Section>

        {/* SECURITY */}
        <Section icon={Shield} title="Security" description="Update your password to keep your account safe">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPwd ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="At least 8 characters"
                  className="h-11 rounded-xl pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPwd ? "text" : "password"}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Re-enter new password"
                  className={cn(
                    "h-11 rounded-xl pl-10",
                    confirmPwd && confirmPwd !== newPwd && "border-destructive focus-visible:ring-destructive"
                  )}
                />
              </div>
              {confirmPwd && confirmPwd !== newPwd && (
                <p className="text-[11px] text-destructive">Passwords don't match</p>
              )}
            </div>

            <Button
              onClick={changePassword}
              disabled={changingPwd || !newPwd || !confirmPwd}
              className="rounded-full bg-gradient-cta text-primary-foreground font-semibold shadow-soft"
            >
              {changingPwd ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
              Update Password
            </Button>
          </div>
        </Section>

        {/* PREFERENCES */}
        <Section icon={Sparkles} title="Preferences" description="Customize your Motiva experience">
          <div className="divide-y divide-border">
            <ToggleRow
              icon={Moon}
              title="Dark mode"
              description="Switch to a darker, calmer theme"
              checked={prefs.dark_mode}
              onChange={(v) => updatePref("dark_mode", v)}
            />
            <ToggleRow
              icon={Volume2}
              title="Sound & voice"
              description="Audio cues and voice playback (coming soon)"
              checked={prefs.sound_enabled}
              onChange={(v) => updatePref("sound_enabled", v)}
            />
          </div>
        </Section>

        {/* NOTIFICATIONS */}
        <Section icon={Bell} title="Notifications" description="Choose how Motiva keeps in touch">
          <div className="divide-y divide-border">
            <ToggleRow
              icon={Bell}
              title="Reminders"
              description="Gentle nudges to stay on track"
              checked={prefs.notifications_enabled}
              onChange={(v) => updatePref("notifications_enabled", v)}
            />
            <ToggleRow
              icon={Sparkles}
              title="Daily check-ins"
              description="A quick mood & focus check every day"
              checked={prefs.daily_checkins_enabled}
              onChange={(v) => updatePref("daily_checkins_enabled", v)}
            />
          </div>
        </Section>

        {/* SIGN OUT */}
        <button
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-card text-destructive font-semibold shadow-soft hover:bg-destructive/5 transition-smooth"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </main>
    </div>
  );
};

const Section = ({
  icon: Icon, title, description, children,
}: {
  icon: typeof UserIcon; title: string; description: string; children: React.ReactNode;
}) => (
  <Card className="rounded-3xl shadow-bubble p-6 sm:p-7">
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground leading-tight">{title}</h2>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
    </div>
    {children}
  </Card>
);

const ToggleRow = ({
  icon: Icon, title, description, checked, onChange,
}: {
  icon: typeof UserIcon; title: string; description: string;
  checked: boolean; onChange: (v: boolean) => void;
}) => (
  <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
    <div className="flex items-start gap-3 min-w-0">
      <Icon className="w-4 h-4 mt-1 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

export default SettingsPage;

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MotivaLogo } from "@/components/MotivaLogo";
import { Button } from "@/components/ui/button";
import { Bell, Sparkles, Lock, MessageCircle, Shield, User as UserIcon } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import oceanBg from "@/assets/welcome-ocean.jpg";

const Welcome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("there");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setName(data.name.split(" ")[0]);
      });
  }, [user]);

  const startChat = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: user.id, title: "New Chat" })
      .select()
      .single();
    if (error) return;
    navigate(`/chat/${data.id}`);
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden animate-fade-up">
      {/* Layer 1: Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${oceanBg})`, zIndex: -2 }}
      />
      {/* Layer 2: Soft white overlay + blur */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(rgba(255,255,255,0.65), rgba(255,255,255,0.75))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          zIndex: -1,
        }}
      />
      <header className="relative z-10 flex items-center justify-between px-6 py-4 sm:px-10">
        <MotivaLogo size="md" />
        <div className="flex items-center gap-3">
          <button className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground hover:text-primary transition-smooth shadow-soft">
            <Bell className="w-5 h-5" />
          </button>
          <UserAvatar size={40} onClick={() => navigate("/settings")} />

        </div>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-up">
          <div
            className="rounded-3xl p-8 sm:p-10 border border-white/60"
            style={{
              background: "rgba(255,255,255,0.75)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
            }}
          >
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow animate-float">
                  <span className="text-5xl">🤖</span>
                </div>
                <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-card" />
              </div>
            </div>

            <div className="text-center mb-8">
              <h1 className="text-3xl font-display font-bold text-foreground mb-3">
                Welcome, {name} 👋
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                Your AI companion is ready to assist you with your day.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-accent/50 rounded-2xl p-4">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <p className="text-xs font-semibold tracking-wider text-primary uppercase mb-1">Capability</p>
                <p className="font-display font-bold text-foreground">Proactive Assistance</p>
              </div>
              <div className="bg-accent/50 rounded-2xl p-4">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                  <Lock className="w-5 h-5 text-primary" />
                </div>
                <p className="text-xs font-semibold tracking-wider text-primary uppercase mb-1">Privacy</p>
                <p className="font-display font-bold text-foreground">End-to-end Encrypted</p>
              </div>
            </div>

            <Button
              onClick={startChat}
              className="w-full h-14 rounded-full bg-gradient-cta hover:opacity-90 text-primary-foreground font-semibold text-base shadow-soft transition-smooth"
            >
              Start Chat <MessageCircle className="w-5 h-5 ml-2" />
            </Button>

            <div className="flex items-center justify-center gap-2 mt-6 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <Shield className="w-4 h-4" />
              <span>Trusted by Intelligence</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Welcome;

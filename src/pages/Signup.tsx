import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MotivaLogo } from "@/components/MotivaLogo";
import { Mail, Lock, User, ArrowRight, Loader2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import signupBg from "@/assets/signup-clouds.jpg";

const Signup = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast.error("Please fill all fields");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, name);
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Account created! 💙");
      navigate("/welcome", { replace: true });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Layer 1: Background image */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${signupBg})` }}
      />
      {/* Layer 2: Overlay + backdrop blur */}
      <div
        aria-hidden
        className="absolute inset-0 bg-white/50"
        style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 sm:px-10">
        <MotivaLogo size="md" />
        <button className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground hover:text-primary transition-smooth shadow-soft">
          <HelpCircle className="w-5 h-5" />
        </button>
      </header>

      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-md animate-fade-up">
          <div className="rounded-3xl p-8 sm:p-10 bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_20px_60px_-20px_hsl(220_40%_30%/0.25)]">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-display font-bold text-foreground mb-2">
                Create your account 💙
              </h1>
              <p className="text-muted-foreground">Start your self-growth journey with AI</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold tracking-wider text-foreground uppercase">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Alex Johnson"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-12 h-14 rounded-2xl bg-accent/40 border-transparent"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold tracking-wider text-foreground uppercase">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="alex@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12 h-14 rounded-2xl bg-accent/40 border-transparent"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold tracking-wider text-foreground uppercase">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 h-14 rounded-2xl bg-accent/40 border-transparent"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-14 rounded-2xl bg-gradient-cta hover:opacity-90 text-primary-foreground font-semibold text-base shadow-soft transition-smooth mt-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Create Account <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-center mt-6 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/auth" className="text-primary font-semibold hover:underline">
                Sign In
              </Link>
            </p>
          </div>

          <div className="mt-8 text-center text-xs text-muted-foreground space-x-4">
            <span>Joined by 12,000+ seekers this month</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;

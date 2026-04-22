import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export const MotivaLogo = ({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) => {
  const sizes = {
    sm: { text: "text-xl", icon: "w-4 h-4" },
    md: { text: "text-2xl", icon: "w-5 h-5" },
    lg: { text: "text-3xl", icon: "w-6 h-6" },
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className={cn("font-display font-bold text-primary tracking-tight", sizes[size].text)}>
        Motiva
      </span>
      <Heart className={cn("text-primary fill-primary", sizes[size].icon)} />
    </div>
  );
};

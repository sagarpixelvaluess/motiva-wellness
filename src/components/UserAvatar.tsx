import { useState, useEffect } from "react";
import { User as UserIcon } from "lucide-react";
import { useProfile } from "@/contexts/ProfileContext";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  size?: number; // pixel size
  className?: string;
  onClick?: () => void;
  asButton?: boolean;
}

export const UserAvatar = ({
  size = 40,
  className,
  onClick,
  asButton = false,
}: UserAvatarProps) => {
  const { profile } = useProfile();
  const url = profile?.avatar_url || null;
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [url]);

  const initial = (profile?.name || profile?.email || "U").trim().charAt(0).toUpperCase();
  const showImg = url && !errored;

  const content = showImg ? (
    <img
      src={url!}
      alt={profile?.name ?? "Profile"}
      onError={() => setErrored(true)}
      className="w-full h-full object-cover transition-opacity duration-300"
      loading="lazy"
    />
  ) : initial && initial !== "U" ? (
    <span className="font-display font-semibold text-primary-foreground" style={{ fontSize: size * 0.42 }}>
      {initial}
    </span>
  ) : (
    <UserIcon className="text-background" style={{ width: size * 0.5, height: size * 0.5 }} />
  );

  const baseClass = cn(
    "relative inline-flex items-center justify-center rounded-full overflow-hidden shadow-soft ring-2 ring-card transition-smooth",
    showImg ? "bg-muted" : "bg-gradient-primary",
    className
  );

  const style = { width: size, height: size };

  if (asButton || onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(baseClass, "hover:opacity-90 active:scale-95")}
        style={style}
        aria-label="Profile"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseClass} style={style}>
      {content}
    </div>
  );
};

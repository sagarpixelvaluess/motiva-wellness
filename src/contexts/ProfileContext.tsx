import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setAvatarUrl: (url: string | null) => void;
  setName: (name: string) => void;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    setProfile(
      data ?? { id: user.id, name: null, email: user.email ?? null, avatar_url: null }
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setAvatarUrl = (url: string | null) =>
    setProfile((p) => (p ? { ...p, avatar_url: url } : p));
  const setName = (name: string) =>
    setProfile((p) => (p ? { ...p, name } : p));

  return (
    <ProfileContext.Provider value={{ profile, loading, refresh, setAvatarUrl, setName }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
};

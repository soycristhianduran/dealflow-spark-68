import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, phone")
        .eq("user_id", user.id)
        .maybeSingle();
      setProfile(data);
    };

    fetchProfile();

    const channel = supabase
      .channel("profile-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, () => {
        fetchProfile();
      })
      .subscribe();

    window.addEventListener("profile-updated", fetchProfile);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("profile-updated", fetchProfile);
    };
  }, [user]);

  const avatarUrl = profile?.avatar_url
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${profile.avatar_url}`
    : null;

  const initials = profile?.first_name && profile?.last_name
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "U";

  return { profile, avatarUrl, initials };
}

import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Camera, Loader2, Save, Mail, Shield, Lock, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface Profile {
  first_name: string;
  last_name: string;
  phone: string;
  avatar_url: string | null;
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profile, setProfile] = useState<Profile>({
    first_name: "",
    last_name: "",
    phone: "",
    avatar_url: null,
  });

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile({
          first_name: data.first_name ?? "",
          last_name: data.last_name ?? "",
          phone: data.phone ?? "",
          avatar_url: data.avatar_url,
        });
      }
    } catch (err) {
      console.warn("Error fetching profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            first_name: profile.first_name.trim() || null,
            last_name: profile.last_name.trim() || null,
            phone: profile.phone.trim() || null,
            avatar_url: profile.avatar_url,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;
      toast.success(t("profilePage.profileUpdated"));
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err: any) {
      console.warn("Error saving profile:", err);
      toast.error(t("profilePage.profileSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error(t("profilePage.passwordFieldsRequired"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("profilePage.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("profilePage.passwordsDoNotMatch"));
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t("profilePage.passwordUpdated"));
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.warn("Error changing password:", err);
      toast.error(err.message || t("profilePage.passwordChangeError"));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t("profilePage.noActiveSession"));

      const response = await supabase.functions.invoke("delete-account");
      if (response.error) throw response.error;

      await signOut();
      navigate("/auth");
      toast.success(t("profilePage.accountDeleted"));
    } catch (err: any) {
      console.warn("Error deleting account:", err);
      toast.error(err.message || t("profilePage.accountDeleteError"));
    } finally {
      setDeleting(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("profilePage.imageOnly"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("profilePage.imageTooLarge"));
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }));

      // Save immediately
      await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      toast.success(t("profilePage.avatarUpdated"));
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err: any) {
      console.warn("Error uploading avatar:", err);
      toast.error(t("profilePage.avatarUploadError"));
    } finally {
      setUploading(false);
    }
  };

  const initials = profile.first_name && profile.last_name
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "U";

  return (
    <AppLayout>
      <AppHeader title={t("profilePage.headerTitle")} subtitle={t("profilePage.headerSubtitle")} />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Avatar section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profilePage.avatarCardTitle")}</CardTitle>
              <CardDescription>
                {t("profilePage.avatarCardDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <Avatar className="h-24 w-24 border-2 border-border">
                    <AvatarImage src={profile.avatar_url ?? undefined} alt={t("profilePage.avatarAlt")} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {uploading ? (
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <Camera className="h-6 w-6 text-white" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {profile.first_name || profile.last_name
                      ? `${profile.first_name} ${profile.last_name}`.trim()
                      : t("profilePage.noNameSet")}
                  </p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? t("profilePage.uploading") : t("profilePage.changePhoto")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profilePage.personalInfoTitle")}</CardTitle>
              <CardDescription>
                {t("profilePage.personalInfoDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">{t("profilePage.firstNameLabel")}</Label>
                      <Input
                        id="first_name"
                        placeholder={t("profilePage.firstNamePlaceholder")}
                        value={profile.first_name}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, first_name: e.target.value }))
                        }
                        maxLength={50}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">{t("profilePage.lastNameLabel")}</Label>
                      <Input
                        id="last_name"
                        placeholder={t("profilePage.lastNamePlaceholder")}
                        value={profile.last_name}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, last_name: e.target.value }))
                        }
                        maxLength={50}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("profilePage.phoneLabel")}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+52 55 1234 5678"
                      value={profile.phone}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, phone: e.target.value }))
                      }
                      maxLength={20}
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {t("profilePage.saveChanges")}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Account info (read-only) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profilePage.accountCardTitle")}</CardTitle>
              <CardDescription>
                {t("profilePage.accountCardDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("profilePage.emailLabel")}</p>
                  <p className="text-sm font-medium text-foreground truncate">{user?.email ?? "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("profilePage.lastSignIn")}</p>
                  <p className="text-sm font-medium text-foreground">
                    {user?.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleString("es-MX")
                      : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change password */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profilePage.changePasswordTitle")}</CardTitle>
              <CardDescription>
                {t("profilePage.changePasswordDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new_password">{t("profilePage.newPasswordLabel")}</Label>
                <Input
                  id="new_password"
                  type="password"
                  placeholder={t("profilePage.newPasswordPlaceholder")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  maxLength={72}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">{t("profilePage.confirmPasswordLabel")}</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  placeholder={t("profilePage.confirmPasswordPlaceholder")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  maxLength={72}
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={handleChangePassword} disabled={changingPassword}>
                  {changingPassword ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  {t("profilePage.changePasswordButton")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Delete account */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-base text-destructive">{t("profilePage.deleteAccountTitle")}</CardTitle>
              <CardDescription>
                {t("profilePage.deleteAccountDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleting}>
                    {deleting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {t("profilePage.deleteAccountButton")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("profilePage.confirmDeleteTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("profilePage.confirmDeleteDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("profilePage.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleDeleteAccount}
                    >
                      {t("profilePage.confirmDeleteButton")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

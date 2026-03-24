"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentSection } from "../../components/agent-section";
import { ProfileSection } from "../../components/profile-section";
import { SettingsLayout } from "../../components/settings-layout";
import { useAuth } from "../../lib/auth-context";
import {
  ApiAuthError,
  fetchModels,
  fetchViewer,
  fetchWorkspaceSettings,
  updateProfile,
  updateWorkspaceSettings,
} from "../../lib/server-api";

export default function SettingsPage() {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<{
    displayName: string;
    email: string;
  } | null>(null);
  const [defaultModel, setDefaultModel] = useState<string>("gpt-5.4-mini");
  const [pageLoading, setPageLoading] = useState(true);

  const accessToken = session?.access_token;

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const routerRef = useRef(router);
  routerRef.current = router;

  const loadData = useCallback(async () => {
    if (!accessToken) return;
    setPageLoading(true);

    try {
      const [viewer, settings] = await Promise.all([
        fetchViewer(accessToken),
        fetchWorkspaceSettings(accessToken),
      ]);

      setProfile({
        displayName: viewer.profile.displayName,
        email: viewer.profile.email,
      });
      setDefaultModel(settings.settings.defaultModel);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        await signOutRef.current();
        routerRef.current.replace("/login");
        return;
      }
    } finally {
      setPageLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      routerRef.current.replace("/login");
      return;
    }
    loadData();
  }, [authLoading, user, loadData]);

  const handleProfileSave = useCallback(
    async (displayName: string) => {
      if (!accessToken) return;
      const result = await updateProfile(accessToken, { displayName });
      setProfile({
        displayName: result.profile.displayName,
        email: result.profile.email,
      });
    },
    [accessToken],
  );

  const handleAgentSave = useCallback(
    async (model: string) => {
      if (!accessToken) return;
      const result = await updateWorkspaceSettings(accessToken, {
        defaultModel: model,
      });
      setDefaultModel(result.settings.defaultModel);
    },
    [accessToken],
  );

  const stableFetchModels = useCallback(() => fetchModels(), []);

  if (authLoading || pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <SettingsLayout>
      {(activeSection) => {
        if (activeSection === "profile") {
          return (
            <ProfileSection
              displayName={profile.displayName}
              email={profile.email}
              onSave={handleProfileSave}
            />
          );
        }

        return (
          <AgentSection
            defaultModel={defaultModel}
            onSave={handleAgentSave}
            fetchModels={stableFetchModels}
          />
        );
      }}
    </SettingsLayout>
  );
}

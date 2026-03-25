"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AgentSection } from "@/components/agent-section";
import { LoadingScreen } from "@/components/loading-screen";
import { ProfileSection } from "@/components/profile-section";
import { useAuth } from "@/lib/auth-context";
import {
  ApiAuthError,
  fetchModels,
  fetchViewer,
  fetchWorkspaceSettings,
  updateProfile,
  updateWorkspaceSettings,
} from "@/lib/server-api";

type SettingsTab = "profile" | "agent";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "agent", label: "Agent" },
];

export default function SettingsPage() {
  const { session } = useAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [profile, setProfile] = useState<{
    displayName: string;
    email: string;
  } | null>(null);
  const [defaultModel, setDefaultModel] = useState<string>("gpt-5.4-mini");
  const [pageLoading, setPageLoading] = useState(true);

  // Ref pattern: prevent token refresh from cascading through dependency arrays
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;
  const hasInitialized = useRef(false);

  const getToken = useCallback(() => accessTokenRef.current, []);

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setPageLoading(true);

    try {
      const [viewer, settings] = await Promise.all([
        fetchViewer(token),
        fetchWorkspaceSettings(token),
      ]);

      setProfile({
        displayName: viewer.profile.displayName,
        email: viewer.profile.email,
      });
      setDefaultModel(settings.settings.defaultModel);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        // Workspace layout handles auth redirect
        return;
      }
    } finally {
      setPageLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (hasInitialized.current) return;
    if (!session?.access_token) return;
    hasInitialized.current = true;
    loadData();
  }, [session?.access_token, loadData]);

  const handleProfileSave = useCallback(
    async (displayName: string) => {
      const token = getToken();
      if (!token) return;
      const result = await updateProfile(token, { displayName });
      setProfile({
        displayName: result.profile.displayName,
        email: result.profile.email,
      });
    },
    [getToken],
  );

  const handleAgentSave = useCallback(
    async (model: string) => {
      const token = getToken();
      if (!token) return;
      const result = await updateWorkspaceSettings(token, {
        defaultModel: model,
      });
      setDefaultModel(result.settings.defaultModel);
    },
    [getToken],
  );

  const stableFetchModels = useCallback(() => fetchModels(), []);

  if (pageLoading) {
    return <LoadingScreen />;
  }

  if (!profile) return null;

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold mb-6">Settings</h1>

      <div className="inline-flex gap-1 rounded-lg bg-neutral-100 p-1 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-white font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-xl">
        {activeTab === "profile" ? (
          <ProfileSection
            displayName={profile.displayName}
            email={profile.email}
            onSave={handleProfileSave}
          />
        ) : (
          <AgentSection
            defaultModel={defaultModel}
            onSave={handleAgentSave}
            fetchModels={stableFetchModels}
          />
        )}
      </div>
    </div>
  );
}

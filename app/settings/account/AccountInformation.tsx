"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/components/AuthProvider";

export default function AccountInformation() {
  const { user, token, isLoading, mutateUser, refreshStats } = useAuth();
  
  const [formData, setFormData] = useState({
    username: "",
    name: "",
    email: "",
  });
  
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string | null }>({ type: null, message: null });

  // Initialize form data when user data loads
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || "",
        name: user.name || "",
        email: user.email || "",
      });
    }
  }, [user]);

  // Check if form data is dirty (has unsaved changes)
  const isDirty = user ? (
    formData.username !== (user.username || "") ||
    formData.name !== (user.name || "") ||
    formData.email !== (user.email || "")
  ) : false;

  // Unsaved changes warning on window unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleCopyId = () => {
    if (!user) return;
    const scholarId = `#${user.id.toString().padStart(6, "0")}`;
    navigator.clipboard.writeText(scholarId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    // Clear status message when user starts typing again
    if (status.type) {
      setStatus({ type: null, message: null });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirty || !user || !token) return;

    setIsSaving(true);
    setStatus({ type: null, message: null });

    // Store original user for potential rollback
    const originalUser = { ...user };

    // Optimistic Update
    mutateUser({
      ...user,
      username: formData.username,
      name: formData.name,
      email: formData.email,
    });

    try {
      const res = await fetch("/api/user/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: formData.username,
          name: formData.name,
          email: formData.email,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus({ type: "success", message: data.message || "Account updated successfully." });
        // Refresh full state from server to ensure perfect sync
        await refreshStats();
      } else {
        // Rollback on API failure
        mutateUser(originalUser);
        setStatus({ type: "error", message: data.error || "An error occurred." });
      }
    } catch (err) {
      console.error(err);
      // Rollback on network failure
      mutateUser(originalUser);
      setStatus({ type: "error", message: "Failed to connect to the server." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="animate-pulse space-y-6 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-14 bg-white/5 rounded"></div>
          <div className="h-14 bg-white/5 rounded"></div>
          <div className="h-14 bg-white/5 rounded"></div>
        </div>
        <div className="border-t border-white/5 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-14 bg-white/5 rounded"></div>
          <div className="h-14 bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  const joinDate = user.createdAt 
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : "Unknown Date";

  return (
    <form onSubmit={handleSave} className="space-y-8 pt-2">
      
      {status.message && (
        <div className={`p-4 rounded border text-sm ${
          status.type === 'success' 
            ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' 
            : 'bg-red-950/20 border-red-900/50 text-accent-red'
        }`}>
          {status.message}
        </div>
      )}

      {/* Editable Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
        <div>
          <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-2">
            Username
          </label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            className="input-field"
            placeholder="Enter username"
            disabled={isSaving}
          />
        </div>
        
        <div>
          <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-2">
            Display Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="input-field"
            placeholder="Enter display name"
            disabled={isSaving}
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-2">
            Email Address
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="input-field"
            placeholder="Enter email address"
            disabled={isSaving}
          />
        </div>
      </div>

      {/* Read-Only System Identity Info */}
      <div className="border-t border-white/5 pt-6">
        <h3 className="text-sm font-rajdhani uppercase tracking-widest text-accent-cyan mb-6">System Identity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
          
          <div>
            <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-1">
              Scholar ID
            </label>
            <div className="flex items-center gap-3">
              <span className="font-mono text-primary text-lg">#{user.id.toString().padStart(6, "0")}</span>
              <button
                type="button"
                onClick={handleCopyId}
                className="text-[0.65rem] font-rajdhani uppercase tracking-widest px-3 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-muted hover:text-primary transition-colors flex items-center gap-1 min-w-[70px] justify-center"
              >
                {copied ? (
                  <span className="text-accent-green flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Copied
                  </span>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-1">
              Joined System
            </label>
            <span className="text-primary font-rajdhani font-semibold text-lg">{joinDate}</span>
          </div>

          <div>
            <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-1">
              Account Status
            </label>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
              <span className="text-primary font-rajdhani font-semibold text-lg">Active</span>
            </div>
          </div>

          <div>
            <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-1">
              Verification Status
            </label>
            <div className="flex items-center gap-3">
              <span className="text-muted font-rajdhani font-semibold text-lg">Unverified</span>
              <button
                type="button"
                disabled
                className="text-[0.65rem] font-rajdhani uppercase tracking-widest px-3 py-1 rounded bg-black/40 border border-white/5 text-muted opacity-50 cursor-not-allowed"
                title="Email verification coming soon"
              >
                Send Link
              </button>
            </div>
          </div>

        </div>
      </div>

      <div className="border-t border-white/5 pt-6 flex justify-end">
        <button
          type="submit"
          className={!isDirty ? "btn-secondary opacity-50 cursor-not-allowed" : "btn-secondary"}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

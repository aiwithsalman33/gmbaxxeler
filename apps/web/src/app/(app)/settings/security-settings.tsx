"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { MIN_PASSWORD, PasswordStrength } from "@/components/password-strength";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";

export function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const change = useMutation({
    mutationFn: () => api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    change.mutate();
  }

  return (
    <Card>
      <CardTitle>Change password</CardTitle>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="currentPassword">Current password</Label>
          <Input id="currentPassword" type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="newPassword">New password</Label>
          <Input id="newPassword" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <PasswordStrength password={newPassword} />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? "Saving" : "Change password"}
          </Button>
          {change.isSuccess && <p className="text-sm text-good">Password changed.</p>}
          {change.isError && (
            <p role="alert" className="text-sm text-bad">
              {change.error.message}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

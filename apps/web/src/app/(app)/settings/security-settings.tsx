"use client";

import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { MIN_PASSWORD, PasswordInput, PasswordStrength } from "@/components/password-strength";
import { Notice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";

export function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const change = useMutation({
    mutationFn: () => api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password changed", { description: "Other devices have been signed out." });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    change.mutate();
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader icon={Lock} title="Change password" description={`Use at least ${MIN_PASSWORD} characters. Other devices are signed out; this one stays signed in.`} />
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Current password">
          {(props) => <PasswordInput {...props} required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />}
        </Field>
        <Field label="New password">
          {(props) => (
            <>
              <PasswordInput {...props} required minLength={MIN_PASSWORD} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              <PasswordStrength password={newPassword} />
            </>
          )}
        </Field>
        {change.isError && (
          <Notice tone="bad" className="sm:col-span-2">
            {change.error.message}
          </Notice>
        )}
        <div className="border-t border-line pt-5 sm:col-span-2">
          <Button type="submit" loading={change.isPending}>
            {change.isPending ? "Saving" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

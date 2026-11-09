"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  inviteMember,
  changeMemberRole,
  removeMember,
} from "@/app/dashboard/team/actions";

type Role = "editor" | "contributor";
type Member = { userId: string; email: string; role: string };

const inputCls =
  "w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30";

export function TeamManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("contributor");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await inviteMember(email.trim(), role);
      if (res.error) setError(res.error);
      else {
        setNotice(`Invited ${email.trim()} as ${role}.`);
        setEmail("");
        router.refresh();
      }
    });
  }

  function onChangeRole(userId: string, newRole: Role) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await changeMemberRole(userId, newRole);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function onRemove(userId: string, who: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await removeMember(userId);
      if (res.error) setError(res.error);
      else {
        setNotice(`Removed ${who}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Invite */}
      <form
        onSubmit={invite}
        className="rounded-xl border border-line bg-surface p-6 shadow-card"
      >
        <h2 className="font-display text-lg font-bold text-ink">
          Invite a colleague
        </h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label htmlFor="invite-email" className="mb-1.5 block text-sm font-semibold text-ink">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@yourschool.edu.au"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="mb-1.5 block text-sm font-semibold text-ink">
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={inputCls}
            >
              <option value="contributor">Contributor (build only)</option>
              <option value="editor">Editor (build + publish)</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden />
            )}
            Invite
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-coral-dark">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 text-sm font-medium text-turf-dark">{notice}</p>
        )}
      </form>

      {/* Members */}
      <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
        <h2 className="font-display text-lg font-bold text-ink">Members</h2>
        {members.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            No one invited yet. You (the owner) have full access.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="min-w-0 truncate text-sm text-ink">
                  {m.email}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={m.role === "editor" ? "editor" : "contributor"}
                    onChange={(e) =>
                      onChangeRole(m.userId, e.target.value as Role)
                    }
                    disabled={pending}
                    className="rounded-lg border border-line-strong bg-canvas px-2.5 py-1.5 text-sm text-ink focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                    aria-label={`Role for ${m.email}`}
                  >
                    <option value="contributor">Contributor</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => onRemove(m.userId, m.email)}
                    disabled={pending}
                    aria-label={`Remove ${m.email}`}
                    className="text-ink-faint transition-colors hover:text-coral disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

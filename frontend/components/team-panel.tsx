"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button, ErrorNote } from "@/components/ui";
import { CopyLink } from "@/components/copy-link";
import { short } from "@/lib/data";

type Team = { quorumId: string | null; threshold: number; members: string[] };

export function TeamPanel() {
  const { getAccessToken, user } = usePrivy();
  const [team, setTeam] = useState<Team | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMember, setNewMember] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    getAccessToken()
      .then((t) => fetch("/api/privy/team", { headers: { authorization: `Bearer ${t}` } }))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => live && setTeam(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [getAccessToken, reload]);

  async function update(patch: { addUserId?: string; threshold?: number }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/privy/team", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}) as Record<string, string>);
      if (!res.ok) {
        setError(body.error ?? "That change was not applied.");
        return;
      }
      setTeam((t) => (t ? { ...t, threshold: body.threshold, members: body.members } : t));
      setNewMember("");
    } catch {
      setError("That change was not applied — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return (
      <div className="mt-9">
        <ErrorNote onRetry={() => setReload((n) => n + 1)} retryLabel="Try reading it again">
          We could not read your team. This tells you nothing about who is on it — nobody was
          added or removed.
        </ErrorNote>
      </div>
    );
  }
  if (!team) return <p className="mt-9 text-slate">Loading your team…</p>;

  return (
    <div className="mt-9 max-w-[62ch]">
      <h2 className="text-[15px] font-medium">Who can approve policy changes</h2>
      <p className="mt-2 text-[12.5px] text-slate">
        Your own id, for someone adding you to their team:
      </p>
      <div className="mt-1">
        <CopyLink url={user?.id ?? ""} label="Your Privy user id" />
      </div>
      <ul className="mt-4 border-t border-rule">
        {team.members.map((m) => (
          <li key={m} className="flex justify-between border-b border-rule py-3 text-[13px]">
            <span className="font-mono text-[12.5px]">{short(m, 16, 6)}</span>
            <span className="text-slate">{m === user?.id ? "You" : "Team member"}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <label htmlFor="member" className="text-[13.5px] font-medium">
          Add a team member
        </label>
        <p className="mt-1 text-[12.5px] text-slate">
          Paste their Privy user id. They have to sign in here at least once before they have one —
          there is nothing to add until they do.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            id="member"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            placeholder="did:privy:…"
            className="h-9 w-full rounded-xs border border-rule px-3 font-mono text-[12.5px] outline-none focus:border-ink"
          />
          <Button
            onClick={() => update({ addUserId: newMember })}
            disabled={busy || !newMember.startsWith("did:privy:") || team.threshold > 1}
          >
            Add
          </Button>
        </div>
        {team.threshold > 1 && (
          <p className="mt-2 text-[12.5px] text-slate">
            Adding someone now needs everyone to sign at once, which this dashboard cannot do yet.
          </p>
        )}
      </div>

      <div className="mt-8 border-t border-rule pt-6">
        <h3 className="text-[14px] font-medium">Approvals required</h3>
        <p className="mt-1 text-[12.5px] text-slate">
          How many people must approve before a policy change is sent. Requiring two means nobody
          on your team can push through a compliance policy change alone through this dashboard.
          It does not affect payouts, and it is not enforced by Privy or by the wallet itself — the
          wallet's owner can still sign alone at the API level. This is a control this dashboard
          applies, nothing more.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="tnum text-[13px]">
            {team.threshold} of {team.members.length}
          </span>
          {team.members.length > 1 && team.threshold === 1 && (
            <Button onClick={() => update({ threshold: 2 })} disabled={busy}>
              Require two approvals
            </Button>
          )}
        </div>
        {team.members.length === 1 && (
          <p className="mt-2 text-[12.5px] text-slate">
            Add a second person before you can require two approvals.
          </p>
        )}
        {team.threshold > 1 && (
          <p className="mt-2 text-[12.5px] text-slate">
            This cannot be lowered from here — that needs everyone to sign at the same moment.
          </p>
        )}
        {error && <p className="mt-3 text-[12.5px] text-alert">{error}</p>}
      </div>
    </div>
  );
}

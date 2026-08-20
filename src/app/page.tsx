"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MetricChart, type Point } from "@/components/MetricChart";
import { PersonShowcase } from "@/components/PersonShowcase";

interface Person {
  id: string;
  name: string;
}

interface DigestEntry {
  metric: string;
  from?: string;
  to: string;
  note: string;
}

interface Digest {
  summary_text: string;
  improved: DigestEntry[];
  worsened: DigestEntry[];
  unchanged: DigestEntry[];
  recommendations: string[];
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Home() {
  const [people, setPeople] = useState<Person[]>([]);
  const [personId, setPersonId] = useState("");
  const [month, setMonth] = useState(currentMonthValue());
  const [digest, setDigest] = useState<Digest | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [byMetric, setByMetric] = useState<Record<string, Point[]>>({});

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => {
        setPeople(d.people ?? []);
        if (d.people?.length) setPersonId(d.people[0].id);
      });
  }, []);

  useEffect(() => {
    if (!personId) return;
    fetch(`/api/lab-values?person_id=${personId}`)
      .then((r) => r.json())
      .then((d) => setByMetric(d.byMetric ?? {}));
    fetch(`/api/digests?person_id=${personId}&report_month=${month}-01`)
      .then((r) => r.json())
      .then((d) => setDigest(d.digest ?? null));
  }, [personId, month]);

  async function generateDigest() {
    if (!personId) return;
    setDigestLoading(true);
    const res = await fetch("/api/digests/generate", {
      method: "POST",
      body: JSON.stringify({ person_id: personId, report_month: `${month}-01` }),
    });
    const data = await res.json();
    setDigestLoading(false);
    if (res.ok) setDigest(data.digest);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Health Assistant</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/upload" className="text-neutral-600 hover:text-neutral-900">
            Upload
          </Link>
          <Link href="/chat" className="text-neutral-600 hover:text-neutral-900">
            Chat
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-neutral-600 hover:text-neutral-900">Sign out</button>
          </form>
        </nav>
      </div>

      <div className="mt-6">
        <PersonShowcase people={people} selectedId={personId} onSelect={setPersonId} />
      </div>

      <div className="mt-6 flex gap-4">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          onClick={generateDigest}
          disabled={digestLoading || !personId}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {digestLoading ? "Generating..." : "Generate monthly digest"}
        </button>
      </div>

      {digest && (
        <div className="mt-8 space-y-4 rounded-xl border border-neutral-200 p-6">
          <p className="whitespace-pre-line text-sm text-neutral-800">{digest.summary_text}</p>

          {digest.worsened.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-700">Worth watching</h3>
              <ul className="mt-1 space-y-1 text-sm text-neutral-700">
                {digest.worsened.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{e.metric}:</span> {e.from} to {e.to}. {e.note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {digest.improved.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-green-700">Improved</h3>
              <ul className="mt-1 space-y-1 text-sm text-neutral-700">
                {digest.improved.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{e.metric}:</span> {e.from} to {e.to}. {e.note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {digest.recommendations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Suggestions</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-neutral-700">
                {digest.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-neutral-400">
            This is not medical advice. Always discuss results and changes with a real doctor.
          </p>
        </div>
      )}

      {Object.keys(byMetric).length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-4">
          {Object.entries(byMetric).map(([metric, points]) => (
            <MetricChart key={metric} metric={metric} points={points} />
          ))}
        </div>
      )}
    </div>
  );
}

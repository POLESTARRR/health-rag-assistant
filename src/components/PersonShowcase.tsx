"use client";

import { useEffect, useState } from "react";

export interface ShowcasePerson {
  id: string;
  name: string;
  /** Optional photo. Without one the pill falls back to a monogram panel. */
  imageUrl?: string;
}

interface PersonStats {
  metrics: number;
  months: number;
  outOfRange: number;
}

/** Deterministic neutral wash per person, so a given name always looks the same. */
const WASHES = [
  "from-neutral-200 to-neutral-400",
  "from-stone-200 to-stone-400",
  "from-zinc-200 to-zinc-400",
  "from-slate-200 to-slate-400",
];

function washFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return WASHES[hash % WASHES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function PersonShowcase({
  people,
  selectedId,
  onSelect,
}: {
  people: ShowcasePerson[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [stats, setStats] = useState<Record<string, PersonStats>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      people.map(async (person) => {
        const res = await fetch(`/api/lab-values?person_id=${person.id}`);
        if (!res.ok) return [person.id, { metrics: 0, months: 0, outOfRange: 0 }] as const;
        const { byMetric = {} } = await res.json();
        const series = Object.values(byMetric) as { report_month: string; out_of_range: boolean | null }[][];
        const months = new Set<string>();
        let outOfRange = 0;
        for (const points of series) {
          points.forEach((p) => months.add(p.report_month));
          if (points[points.length - 1]?.out_of_range) outOfRange++;
        }
        return [person.id, { metrics: series.length, months: months.size, outOfRange }] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setStats(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [people]);

  if (people.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-4">
      {people.map((person) => {
        const selected = person.id === selectedId;
        const stat = stats[person.id];

        return (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => onSelect(person.id)}
              aria-pressed={selected}
              className={`group relative block h-[380px] w-44 overflow-hidden rounded-full border text-left outline-none transition sm:h-[500px] ${
                selected
                  ? "border-neutral-900 ring-1 ring-neutral-900"
                  : "border-neutral-200 hover:border-neutral-400"
              } focus-visible:ring-2 focus-visible:ring-neutral-900`}
            >
              {/* Image layer. Scales on hover and focus. */}
              {person.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={person.imageUrl}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                />
              ) : (
                <div
                  aria-hidden
                  className={`flex h-full w-full items-center justify-center bg-gradient-to-b ${washFor(
                    person.name,
                  )} transition-transform duration-500 ease-out group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transform-none motion-reduce:transition-none`}
                >
                  {/* Crossfades out as the circular overlay fades in, since both sit dead centre. */}
                  <span
                    className={`text-5xl font-semibold text-white/70 transition-opacity duration-300 motion-reduce:transition-none ${
                      selected ? "opacity-0" : "group-hover:opacity-0 group-focus-visible:opacity-0"
                    }`}
                  >
                    {initials(person.name)}
                  </span>
                </div>
              )}

              {/* Name, always legible over the wash. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-6 pb-8 pt-12 text-center">
                <span className="text-sm font-medium text-white">{person.name}</span>
                {stat && stat.outOfRange > 0 && (
                  <span className="mt-1 block text-xs text-red-200">
                    {stat.outOfRange} out of range
                  </span>
                )}
              </div>

              {/* Circular overlay. Hidden until hover or focus, and shown while selected. */}
              <div
                className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-300 motion-reduce:transition-none ${
                  selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                }`}
              >
                <div className="flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-full border border-white/70 bg-black/25 text-center backdrop-blur-[2px]">
                  {stat ? (
                    <>
                      <span className="text-xs font-medium text-white">
                        {stat.months} {stat.months === 1 ? "month" : "months"}
                      </span>
                      <span className="text-[11px] text-white/80">
                        {stat.metrics} {stat.metrics === 1 ? "metric" : "metrics"}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-white/80">Loading</span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

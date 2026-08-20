"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Point {
  report_month: string;
  value: number | null;
  unit: string | null;
  out_of_range: boolean | null;
}

export function MetricChart({ metric, points }: { metric: string; points: Point[] }) {
  const unit = points.find((p) => p.unit)?.unit ?? "";
  const latest = points[points.length - 1];
  const anyOutOfRange = points.some((p) => p.out_of_range);

  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-neutral-800">{metric}</h3>
        <span className={`text-sm font-semibold ${anyOutOfRange ? "text-red-600" : "text-neutral-700"}`}>
          {latest?.value} {unit}
        </span>
      </div>
      <div className="mt-2 h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <XAxis dataKey="report_month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(0, 7)} />
            <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
            <Tooltip labelFormatter={(v) => v} />
            <Line type="monotone" dataKey="value" stroke="#171717" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

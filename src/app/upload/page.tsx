"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";

interface Person {
  id: string;
  name: string;
  relation: string | null;
}

interface QueueItem {
  file: File;
  status: "queued" | "uploading" | "parsing" | "done" | "error";
  error?: string;
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function UploadPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [personId, setPersonId] = useState<string>("");
  const [newPersonName, setNewPersonName] = useState("");
  const [month, setMonth] = useState(currentMonthValue());
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => {
        setPeople(d.people ?? []);
        if (d.people?.length) setPersonId(d.people[0].id);
      });
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setQueue((q) => [...q, ...acceptedFiles.map((file) => ({ file, status: "queued" as const }))]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "image/*": [".png", ".jpg", ".jpeg"] },
  });

  async function createPerson() {
    if (!newPersonName.trim()) return;
    const res = await fetch("/api/people", {
      method: "POST",
      body: JSON.stringify({ name: newPersonName.trim() }),
    });
    const { person } = await res.json();
    setPeople((p) => [...p, person]);
    setPersonId(person.id);
    setNewPersonName("");
  }

  async function processQueue() {
    if (!personId) return;
    const reportMonth = `${month}-01`;

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== "queued") continue;

      setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item)));

      const formData = new FormData();
      formData.append("file", queue[i].file);
      formData.append("person_id", personId);
      formData.append("report_month", reportMonth);

      try {
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error ?? "upload failed");

        setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: "parsing" } : item)));

        const parseRes = await fetch(`/api/documents/${uploadData.document.id}/parse`, { method: "POST" });
        const parseData = await parseRes.json();
        if (!parseRes.ok) throw new Error(parseData.error ?? "parse failed");

        setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: "done" } : item)));
      } catch (err) {
        setQueue((q) =>
          q.map((item, idx) =>
            idx === i ? { ...item, status: "error", error: err instanceof Error ? err.message : String(err) } : item,
          ),
        );
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-neutral-900">Upload this month&apos;s documents</h1>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Person</label>
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              placeholder="Add new person (e.g. Mom)"
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
            />
            <button onClick={createPerson} className="rounded-md bg-neutral-200 px-2 py-1 text-xs">
              Add
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">Report month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`mt-6 cursor-pointer rounded-xl border-2 border-dashed p-10 text-center text-sm ${
          isDragActive ? "border-neutral-500 bg-neutral-50" : "border-neutral-300"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-neutral-600">Drop PDFs or photos of reports here, or click to browse</p>
      </div>

      {queue.length > 0 && (
        <ul className="mt-6 space-y-2">
          {queue.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm">
              <span className="truncate">{item.file.name}</span>
              <span
                className={
                  item.status === "error"
                    ? "text-red-600"
                    : item.status === "done"
                      ? "text-green-600"
                      : "text-neutral-500"
                }
              >
                {item.status === "error" ? item.error : item.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      {queue.some((i) => i.status === "queued") && (
        <button
          onClick={processQueue}
          disabled={!personId}
          className="mt-6 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Upload & process {queue.filter((i) => i.status === "queued").length} file(s)
        </button>
      )}
    </div>
  );
}

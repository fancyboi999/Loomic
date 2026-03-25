"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchJob, type BackgroundJobResponse } from "@/lib/server-api";

export type PendingJob = {
  jobId: string;
  title?: string;
  model?: string;
  placement: { x: number; y: number; width: number; height: number };
  startedAt: number;
};

export type CompletedJob = BackgroundJobResponse & {
  _placement: { x: number; y: number; width: number; height: number };
  _title?: string;
};

type JobPollingResult = {
  pendingJobs: PendingJob[];
  addJob: (job: PendingJob) => void;
  completedJobs: CompletedJob[];
  clearCompletedJob: (jobId: string) => void;
};

const POLL_INTERVAL_MS = 2000;

export function useJobPolling(accessToken: string): JobPollingResult {
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const pendingJobsRef = useRef(pendingJobs);
  pendingJobsRef.current = pendingJobs;

  const addJob = useCallback((job: PendingJob) => {
    setPendingJobs((prev) => [...prev, job]);
  }, []);

  const clearCompletedJob = useCallback((jobId: string) => {
    setCompletedJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  useEffect(() => {
    if (pendingJobs.length === 0) return;

    const interval = setInterval(async () => {
      const token = accessTokenRef.current;
      const current = pendingJobsRef.current;
      if (current.length === 0) return;

      const results = await Promise.allSettled(
        current.map((p) =>
          fetchJob(token, p.jobId).then((job) => ({ pending: p, job })),
        ),
      );

      const finishedIds: string[] = [];
      const newCompleted: CompletedJob[] = [];

      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const { pending, job } = r.value;
        if (job.status === "succeeded") {
          finishedIds.push(pending.jobId);
          newCompleted.push({
            ...job,
            _placement: pending.placement,
            ...(pending.title !== undefined ? { _title: pending.title } : {}),
          });
        } else if (
          job.status === "failed" ||
          job.status === "dead_letter" ||
          job.status === "canceled"
        ) {
          finishedIds.push(pending.jobId);
        }
      }

      if (finishedIds.length > 0) {
        setPendingJobs((prev) =>
          prev.filter((j) => !finishedIds.includes(j.jobId)),
        );
      }
      if (newCompleted.length > 0) {
        setCompletedJobs((prev) => [...prev, ...newCompleted]);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [pendingJobs.length]);

  return { pendingJobs, addJob, completedJobs, clearCompletedJob };
}

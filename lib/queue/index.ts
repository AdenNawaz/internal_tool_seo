import { Queue } from "bullmq";
import { makeConnection } from "./connection";

function makeQueue(name: string) {
  return new Queue(name, {
    connection: makeConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });
}

export const queues = {
  research: makeQueue("research"),
  ranking: makeQueue("ranking"),
  competitor: makeQueue("competitor"),
  aiVisibility: makeQueue("ai-visibility"),
  contentQuality: makeQueue("content-quality"),
  clusterHealth: makeQueue("cluster-health"),
  trend: makeQueue("trend"),
  linking: makeQueue("linking"),
  refresh: makeQueue("refresh"),
};

type QueueName = keyof typeof queues;

export interface EnqueueOptions {
  delay?: number;
  priority?: number;
  jobId?: string;
}

export async function enqueue(
  queueName: QueueName,
  jobName: string,
  data: unknown,
  opts?: EnqueueOptions
) {
  return queues[queueName].add(jobName, data, opts);
}

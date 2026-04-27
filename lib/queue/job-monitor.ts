import { queues } from "./index";

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function getAllQueueStats(): Promise<QueueStats[]> {
  return Promise.all(
    Object.entries(queues).map(async ([name, queue]) => {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      return { name, waiting, active, completed, failed, delayed };
    })
  );
}

export async function getRecentFailures(limit = 20) {
  const all = await Promise.all(
    Object.entries(queues).map(async ([name, queue]) => {
      const jobs = await queue.getFailed(0, limit - 1);
      return jobs.map((j) => ({
        id: j.id,
        queue: name,
        name: j.name,
        data: j.data,
        failedReason: j.failedReason,
        processedOn: j.processedOn,
        timestamp: j.timestamp,
      }));
    })
  );
  return all
    .flat()
    .sort((a, b) => (b.processedOn ?? 0) - (a.processedOn ?? 0))
    .slice(0, limit);
}

export async function retryJob(queueName: string, jobId: string) {
  const queue = queues[queueName as keyof typeof queues];
  if (!queue) throw new Error(`Unknown queue: ${queueName}`);
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  await job.retry();
}

export type ITaskState =
    | "init"
    | "start"
    | "running"
    | "pause"
    | "abort"
    | "done"
    | "error";

export interface ITaskOption {
    /** 并发任务数 */
    concurrency: number;
    /** 每个任务执行间的间隔 */
    interval: number;
}

export type IQueueState =
    | "init"
    | "start"
    | "running"
    | "pause"
    | "standby"
    | "stopping"
    | "abort"
    | "done"
    | "error";

export interface IQueueOption {
    /** 并发任务数 */
    concurrency: number;
    /** 每个任务执行间的间隔 */
    interval: number;
}

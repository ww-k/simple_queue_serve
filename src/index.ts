import mitt from "mitt";

import Task from "./task";

import type { Emitter } from "mitt";

type IQueueState =
    | "init"
    | "running"
    | "pause"
    | "standby"
    | "stopping"
    | "abort"
    | "done"
    | "error";

interface IQueueOption {
    /** 并发任务数 */
    concurrency?: number;
    /** 每个任务执行间的间隔 */
    interval?: number;
}

type IEvents<T extends Task> = {
    init: undefined;
    running: undefined;
    pause: undefined;
    standby: undefined;
    stopping: undefined;
    abort: undefined;
    done: undefined;
    error: undefined;
    resume: IQueueState;
    progress: {
        running: number;
        pending: number;
        result: unknown;
        task: T;
    };
    taskstart: T;
    taskerror: { err: unknown; task: T };
};
/**
 *  合法的状态集合
 */
const QUEUE_STATES: Set<IQueueState> = new Set([
    "init",
    "running",
    "pause",
    "standby",
    "stopping",
    "abort",
    "done",
    "error",
] as IQueueState[]);

/** 任务队列类 */
export default class QueueService<T extends Task> {
    /** 队列的长度，运行中的+排队中的 */
    length: number = 0;
    state: IQueueState = "init";
    #state: IQueueState = "init";
    /** 配置对象 */
    #configuration = {
        /** 并发任务数 */
        concurrency: 5,
        /** 每个任务执行间的间隔 */
        interval: 25,
    };
    /** 排队中的任务列表 */
    #pendingList: T[] = [];
    /** 运行中的任务map */
    #runningTaskMap: Map<string, T> = new Map();
    /** 队列运行的定时检查的timerId */
    #queueTimer?: number | NodeJS.Timeout;
    #stateBeforePause?: IQueueState;
    #emitter: Emitter<IEvents<T>>;
    /**
     * 创建一个任务队列
     */
    constructor(option?: IQueueOption) {
        this.#state = "init";
        this.#emitter = mitt<IEvents<T>>();
        if (option) {
            this.setConfig(option);
        }

        Object.defineProperties(this, {
            state: {
                enumerable: true,
                configurable: false,
                get: () => this.#state,
                set: () => null,
            },
            length: {
                get: () => this.#runningTaskMap.size + this.#pendingList.length,
                set: () => null,
            },
        });
    }

    #setState(state: IQueueState, event?: IEvents<T>[IQueueState]) {
        if (!QUEUE_STATES.has(state)) {
            throw new Error("invalid state");
        }
        if (this.#state !== state && !this.isEnd()) {
            //不能重复设置state为相同状态
            this.#state = state;
            if (this.#state === state) {
                console.log("queue state change", state, event);
                //状态成功改变才触发事件
                this.#emit(state, event);
            }
        }
    }

    #emit<Key extends keyof IEvents<T>>(name: Key, event: IEvents<T>[Key]) {
        this.#emitter.emit(name, event);
    }

    setConfig(option: IQueueOption) {
        this.#configuration = Object.assign(this.#configuration, option);
    }

    /**
     * 启动队列服务，队列中任务都执行完毕后，队列会进入待机状态，有新任务进入队列时，也重新激活队列。
     */
    start() {
        if (this.#state !== "init") return;

        this.#setState("running");

        this.#nextTask();
    }

    /**
     * 停止队列服务, 等待队列中的剩余任务执行完再停止，且不在接收新的任务加入队列。
     */
    stop() {
        if (this.isEnd()) return;

        this.#setState("stopping");
    }

    /**
     * 中止队列服务, 会停止队列服务，并立即清空队列中等待执行的任务。
     */
    abort() {
        if (this.isEnd()) return;

        clearTimeout(this.#queueTimer);
        this.#queueTimer = undefined;
        this.#runningTaskMap.clear();
        this.#pendingList.length = 0;

        this.#setState("abort");
    }

    /**
     * 暂停队列服务, 不会有新的任务从等待列表进入执行状态。
     */
    pause() {
        if (this.#state !== "running" && this.#state !== "standby") {
            console.log(
                "only can pause when queue state is running or standby",
            );
            return;
        }

        clearTimeout(this.#queueTimer);
        this.#queueTimer = undefined;

        this.#stateBeforePause = this.#state;
        this.#setState("pause");
    }

    /**
     * 恢复队列服务
     */
    resume() {
        if (this.#state === "pause" && this.#stateBeforePause) {
            this.#state = this.#stateBeforePause;
            this.#emit("resume", this.#stateBeforePause);

            this.#setDoneOrNextTask();
        }
    }

    /**
     * 是否结束
     */
    isEnd() {
        return (
            this.#state === "done" ||
            this.#state === "error" ||
            this.#state === "abort"
        );
    }

    /**
     * 判断当前能否往队列中添加任务
     */
    #canAddTask() {
        return (
            this.#state === "init" ||
            this.#state === "running" ||
            this.#state === "standby"
        );
    }

    /**
     * 往队列尾部添加一条任务
     */
    push(fn: T | (() => void)) {
        return this.#addTask(false, fn);
    }

    /**
     * 往队列头部插入一条任务
     */
    unshift(fn: T | (() => void)) {
        return this.#addTask(true, fn);
    }

    /**
     * 移除指定的任务
     */
    remove(task: T | (() => void)) {
        const index = this.#pendingList.findIndex(
            (task1) => task1 === task || task1.excutor === task,
        );

        const task1 = this.#pendingList[index];
        if (!task1) {
            return;
        }

        this.#pendingList.splice(index, 1);
    }

    /**
     * 清空队列
     */
    clear() {
        this.#pendingList.length = 0;
    }

    /**
     * 循环队列中的每一项任务，并都执行一次给定的函数。
     */
    forEach(callback: (value: T, index: number, array: T[]) => void) {
        this.#pendingList.forEach(callback);
    }

    /**
     * 执行下一个任务, 并从队列中移除该任务
     */
    #nextTask() {
        const taskRunner = (task: T) => {
            if (task.isEnd()) {
                this.#setDoneOrNextTask();
                return;
            }
            const __task_event_on_queue_done = (ret: unknown) => {
                this.#runningTaskMap.delete(task.id);
                this.#emit("progress", {
                    running: this.#runningTaskMap.size,
                    pending: this.#pendingList.length,
                    result: ret,
                    task,
                });

                this.#setDoneOrNextTask();
            };
            const __task_event_on_queue_error = (err: unknown) => {
                this.#runningTaskMap.delete(task.id);
                this.#emit("taskerror", {
                    err,
                    task,
                });

                this.#setDoneOrNextTask();
            };
            this.#runningTaskMap.set(task.id, task);
            setTimeout(() => {
                this.#emit("taskstart", task);
                task.start()
                    .then(__task_event_on_queue_done)
                    .catch(__task_event_on_queue_error);
            });
        };

        while (this.#runningTaskMap.size < this.#configuration.concurrency) {
            const nextTask = this.#pendingList.shift();
            if (nextTask) {
                taskRunner(nextTask);
            } else {
                break;
            }
        }
    }

    #setDoneOrNextTask() {
        if (this.#state === "init") {
            return;
        }

        //队列中没有任务的时候
        if (this.#runningTaskMap.size === 0 && this.#pendingList.length === 0) {
            clearTimeout(this.#queueTimer);
            this.#queueTimer = undefined;

            if (this.#state === "stopping") {
                this.#setState("done");
            } else {
                //如果队列中没有任务了，且不是stopping状态，让队列进入待机状态，节省资源
                this.#setState("standby");
            }

            return;
        }

        if (this.#queueTimer || this.#state === "pause") {
            return;
        }

        if (this.#state === "standby") {
            this.#setState("running");
        }

        this.#queueTimer = setTimeout(() => {
            this.#nextTask();
            this.#queueTimer = undefined;
        }, this.#configuration.interval);
    }

    /**
     * 添加一条任务
     * @param {boolean} jump 是否插队，是则添加到队列头部，否则则添加到尾部。插队不道德，所以默认否。
     * @param {function} fn 任务函数
     */
    #addTask(jump: boolean, fn: T | (() => void)) {
        if (!this.#canAddTask()) {
            throw new Error("queue can not add task in current state");
        }

        let task: T;
        if (fn instanceof Task) {
            task = fn;
        } else if (typeof fn === "function") {
            task = new Task({ excutor: fn }) as T;
        } else {
            throw new Error("task must be function or instanceof Task");
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        jump ? this.#pendingList.unshift(task) : this.#pendingList.push(task);

        setTimeout(() => this.#setDoneOrNextTask());

        return task;
    }
}

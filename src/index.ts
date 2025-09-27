import mitt from "mitt";

import Task from "./task";

import type { IQueueOption, IQueueState } from "./types";

/**
 *  合法的状态集合
 */
const QUEUE_STATES: Set<IQueueState> = new Set([
    "init",
    "start",
    "running",
    "pause",
    "standby",
    "stopping",
    "abort",
    "done",
    "error",
] as IQueueState[]);

/**
 * state属性访问器，确保state只在允许的范围内，且不会被外部修改
 */
function StateAccessor() {
    let state: IQueueState = "init";

    return {
        get: () => state,
        set: (v: IQueueState) => {
            if (!QUEUE_STATES.has(v)) {
                throw new Error("invalid state");
            }
            if (isEnd(state)) return;
            state = v;
        },
    };
}

/**
 * 判断任务是否结束
 */
function isEnd(state: IQueueState) {
    return state === "done" || state === "error" || state === "abort";
}

/** 任务队列类 */
export default class TaskQueue<T extends Task> {
    state: IQueueState = "init";
    /**
     * 队列的长度，运行中的+排队中的
     */
    length: number = 0;
    /** 配置对象 */
    _configuration: IQueueOption = {
        /** 并发任务数 */
        concurrency: 5,
        /** 每个任务执行间的间隔 */
        interval: 25,
    };
    /** 排队中的任务列表 */
    _pendingList: T[] = [];
    /** 运行中的任务map */
    _runningTaskMap: Map<T, T> = new Map();
    /** 队列运行的定时检查的timerId */
    _queueTimer?: any;
    _stateBeforePause?: IQueueState;
    /**
     * 创建一个任务队列
     */
    constructor() {
        const stateAccessor = StateAccessor();
        Object.defineProperties(this, {
            state: {
                enumerable: true,
                configurable: false,
                get: stateAccessor.get,
                set: stateAccessor.set,
            },
            length: {
                get: () => this._runningTaskMap.size + this._pendingList.length,
                set: () => null,
            },
        });
        const emitter = mitt();
    }

    // biome-ignore lint/suspicious/noExplicitAny: ignore
    setState(name: IQueueState, ...args: any[]) {
        if (this.state !== name && !isEnd(this.state)) {
            //不能重复设置state为相同状态
            this.state = name;
            if (this.state === name) {
                console.log("queue state change", name, args);
                //状态成功改变才触发事件
                this.emit(name, args);
            }
        }
    }

    // biome-ignore lint/suspicious/noExplicitAny: ignore
    emit(event: string, ...args: any[]) {
        console.log(event, ...args);
        // TODO impl
    }

    config(option: IQueueOption) {
        this._configuration = Object.assign(this._configuration, option);
    }

    /**
     * 启动队列服务，队列中任务都执行完毕后，队列会进入待机状态，有新任务进入队列时，也重新激活队列。
     */
    start() {
        if (this.state !== "init") return;

        this.setState("start");

        this.state = "running";

        this._nextTask();
    }

    /**
     * 停止队列服务, 等待队列中的剩余任务执行完再停止，且不在接收新的任务加入队列。
     */
    stop() {
        if (this.isEnd()) return;

        this.state = "stopping";
    }

    /**
     * 中止队列服务, 会停止队列服务，并立即清空队列中等待执行的任务。
     */
    abort() {
        if (this.isEnd()) return;

        clearTimeout(this._queueTimer);
        this._queueTimer = null;
        this._runningTaskMap.clear();
        this._pendingList.length = 0;

        this.setState("abort");
    }

    /**
     * 暂停队列服务, 不会有新的任务从等待列表进入执行状态。
     */
    pause() {
        if (this.state !== "running" && this.state !== "standby") {
            console.log(
                "only can pause when queue state is running or standby",
            );
            return;
        }

        clearTimeout(this._queueTimer);
        this._queueTimer = null;

        this._stateBeforePause = this.state;
        this.setState("pause");
    }

    /**
     * 恢复队列服务
     */
    resume() {
        if (this.state === "pause" && this._stateBeforePause) {
            this.state = this._stateBeforePause;
            this.emit("resume", this._stateBeforePause);

            this._setDoneOrNextTask();
        }
    }

    /**
     * 是否结束
     */
    isEnd() {
        return isEnd(this.state);
    }

    /**
     * 判断当前能否往队列中添加任务
     */
    canAddTask() {
        return (
            this.state === "init" ||
            this.state === "running" ||
            this.state === "standby"
        );
    }

    /**
     * 往队列尾部添加一条任务
     */
    push(fn) {
        return addTask.call(this, false, fn);
    }

    /**
     * 往队列头部插入一条任务
     * @param {function|task} fn 任务函数或任务实例
     * @return {Task} task 任务实例
     */
    unshift(fn) {
        return addTask.call(this, true, fn);
    }

    /**
     * 清空队列
     */
    clear() {
        this._pendingList.length = 0;
        this.emit("clear");
    }

    /**
     * 循环队列中的每一项任务，并都执行一次给定的函数。
     */
    forEach(callback: (value: T, index: number, array: T[]) => void) {
        this._pendingList.forEach(callback);
    }

    /**
     * 执行下一个任务, 并从队列中移除该任务
     */
    _nextTask() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const queue = this;

        const taskRunner = (task) => {
            if (task.isEnd()) {
                queue._setDoneOrNextTask("taskabort");
                return;
            }
            task.__task_event_on_queue_start =
                function __task_event_on_queue_start() {
                    delete task.__task_event_on_queue_start;
                    queue.emit("taskstart", task);
                };
            task.__task_event_on_queue_done =
                function __task_event_on_queue_done(ret) {
                    queue._runningTaskMap.delete(task.id);
                    queue.emit(
                        "progress",
                        {
                            running: queue._runningTaskMap.size,
                            pending: queue._pendingList.length,
                            result: ret,
                        },
                        task,
                    );

                    delete task.__task_event_on_queue_done;
                    queue._setDoneOrNextTask("taskdone");
                };
            task.__task_event_on_queue_error =
                function __task_event_on_queue_error(err) {
                    queue._runningTaskMap.delete(task.id);
                    queue.emit("taskerror", err, task);

                    delete task.__task_event_on_queue_error;
                    queue._setDoneOrNextTask("taskerror");
                };
            task.__task_event_on_queue_abort =
                function __task_event_on_queue_abort() {
                    queue._runningTaskMap.delete(task.id);
                    queue.emit("taskabort", task);

                    delete task.__task_event_on_queue_abort;
                    queue._setDoneOrNextTask("taskabort");
                };

            task.once("start", task.__task_event_on_queue_start);
            task.once("done", task.__task_event_on_queue_done);
            task.once("error", task.__task_event_on_queue_error);
            task.once("abort", task.__task_event_on_queue_abort);

            queue._runningTaskMap.set(task.id, task);
            setTimeout(() => task.start());
        };

        while (this._runningTaskMap.size < this._configuration.concurrency) {
            const nextTask = queue._pendingList.shift();
            if (nextTask) {
                taskRunner(nextTask);
            } else {
                break;
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _setDoneOrNextTask(flag?: string) {
        if (this.state === "init") {
            return;
        }

        //队列中没有任务的时候
        if (this._runningTaskMap.size === 0 && this._pendingList.length === 0) {
            clearTimeout(this._queueTimer);
            this._queueTimer = null;

            if (this.state === "stopping") {
                this.setState("done");
            } else {
                //如果队列中没有任务了，且不是stopping状态，让队列进入待机状态，节省资源
                this.state = "standby";
            }

            return;
        }

        if (this._queueTimer || this.state === "pause") {
            return;
        }

        if (this.state === "standby") {
            this.state = "running";
        }

        this._queueTimer = setTimeout(() => {
            this._nextTask();
            this._queueTimer = null;
        }, this._configuration.interval);
    }

    /**
     * 移除指定的任务
     * @param {function|task} task 任务函数或任务实例
     */
    remove(task) {
        const index = this._pendingList.findIndex((task1) => task1 === task);

        let task1;
        if (index === -1) {
            const iterator = this._runningTaskMap.values();
            let result = iterator.next();
            while (!result.done) {
                task1 = result.value;
                if (task1 === task) {
                    break;
                }
                result = iterator.next();
            }
            if (task1) {
                this._runningTaskMap.delete(task1);
                //使用兼容性更好的removeListener, off是10.0.0新曾的方法
                if (task1.__task_event_on_queue_start) {
                    task1.removeListener(
                        "start",
                        task1.__task_event_on_queue_start,
                    );
                    delete task1.__task_event_on_queue_start;
                }
                if (task1.__task_event_on_queue_done) {
                    task1.removeListener(
                        "done",
                        task1.__task_event_on_queue_done,
                    );
                    delete task1.__task_event_on_queue_done;
                }
                if (task1.__task_event_on_queue_error) {
                    task1.removeListener(
                        "error",
                        task1.__task_event_on_queue_error,
                    );
                    delete task1.__task_event_on_queue_error;
                }
                if (task1.__task_event_on_queue_abort) {
                    task1.removeListener(
                        "abort",
                        task1.__task_event_on_queue_abort,
                    );
                    delete task1.__task_event_on_queue_abort;
                }
                this._setDoneOrNextTask("taskremove");
            }
            return;
        }

        task1 = this._pendingList[index];

        if (["start", "running"].indexOf(task1.state) != -1) {
            return;
        }

        this._pendingList.splice(index, 1);
    }
}

/**
 * 添加一条任务
 * @param {boolean} jump 是否插队，是则添加到队列头部，否则则添加到尾部。插队不道德，所以默认否。
 * @param {function} fn 任务函数
 * @return {Task} task 任务实例
 */
function addTask(jump, fn) {
    if (!this.canAddTask()) {
        return false;
    }

    let task;
    if (fn instanceof Task || fn instanceof TaskQueue) {
        task = fn;
    } else if (typeof fn === "function") {
        task = new Task();
        task.config(fn);
    }

    if (!task) {
        throw new Error("task must be function or instanceof Task");
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    jump ? this._pendingList.unshift(task) : this._pendingList.push(task);

    setTimeout(() => this._setDoneOrNextTask("push"));

    return task;
}

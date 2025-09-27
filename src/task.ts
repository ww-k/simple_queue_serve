import type { ITaskState } from "./types";

/**
 *  任务合法的状态列表, 同步任务没有'running'状态
 *  @type {array}
 */
const TASK_STATES: Set<ITaskState> = new Set([
    "init",
    "start",
    "running",
    "done",
    "error",
] as ITaskState[]);

/**
 *  队列自增长id
 */
let taskId: number = 0;

/**
 * state属性访问器，确保state只在允许的范围内，且不会被外部修改
 */
function StateAccessor() {
    let state: ITaskState = "init";

    return {
        get: () => state,
        set: (v: ITaskState) => {
            if (!TASK_STATES.has(v)) {
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
function isEnd(state: ITaskState) {
    return state === "done" || state === "error";
}

/** 任务类 */
export default class Task {
    readonly id: string;
    state: ITaskState = "init";
    _retryCount: number = 0;
    excutor: () => void | Promise<void>;
    onDone?: () => void;
    onError?: (err: unknown) => void;
    constructor({
        excutor,
        onDone,
        onError,
    }: {
        excutor: () => void | Promise<void>;
        onDone?: () => void;
        onError?: (err: unknown) => void;
    }) {
        if (typeof excutor !== "function") {
            throw new Error("fn must be function");
        }

        this.excutor = excutor;
        this.onDone = onDone;
        this.onError = onError;

        this.id = `${Date.now()}_task_${++taskId}`;

        const stateAccessor = StateAccessor();
        Object.defineProperties(this, {
            state: {
                enumerable: true,
                configurable: false,
                get: stateAccessor.get,
                set: stateAccessor.set,
            },
        });

        this._retryCount = 0;
    }

    setState(name: ITaskState) {
        if (this.state !== name && !isEnd(this.state)) {
            //不能重复设置state为相同状态
            this.state = name;
        }
    }

    isEnd() {
        return isEnd(this.state);
    }

    /**
     * 开始执行任务
     */
    start() {
        if (this.state !== "init") return;

        this.setState("start");

        if (typeof this.excutor === "function") {
            const onDone = () => {
                this.setState("done");
                this.onDone?.();
            };
            const onError = (err: unknown) => {
                this.setState("error");
                this.onError?.(err);
            };
            try {
                const ret = this.excutor();

                if (ret && typeof ret.then === "function") {
                    this.setState("running");
                    ret.then(onDone).catch(onError);
                } else {
                    onDone();
                }
            } catch (error) {
                onError(error);
            }
        }
    }
}

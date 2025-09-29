export type ITaskState = "init" | "start" | "running" | "done" | "error";

/**
 *  任务合法的状态列表, 同步任务没有'running'状态
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

/** 任务类 */
export default class Task {
    id: string;
    state: ITaskState;
    excutor: () => void | Promise<void>;
    #id: string;
    #state: ITaskState = "init";
    #retryCount: number = 0;
    #excutor: () => void | Promise<void>;
    #onDone?: () => void;
    #onError?: (err: unknown) => void;
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

        this.#excutor = excutor;
        this.#onDone = onDone;
        this.#onError = onError;

        this.#id = `${Date.now()}_task_${++taskId}`;

        this.#retryCount = 0;

        Object.defineProperties(this, {
            id: {
                enumerable: true,
                configurable: false,
                get: () => this.#id,
                set: () => null,
            },
            state: {
                enumerable: true,
                configurable: false,
                get: () => this.#state,
                set: () => null,
            },
            excutor: {
                enumerable: true,
                configurable: false,
                get: () => this.#excutor,
                set: () => null,
            },
        });

        this.id = this.#id;
        this.state = this.#state;
        this.excutor = this.#excutor;
    }

    #setState(state: ITaskState) {
        if (!TASK_STATES.has(state)) {
            throw new Error("invalid state");
        }
        if (this.#state !== state && !this.isEnd()) {
            //不能重复设置state为相同状态
            this.#state = state;
        }
    }

    isEnd() {
        return this.#state === "done" || this.#state === "error";
    }

    /**
     * 开始执行任务
     */
    async start() {
        if (this.#state !== "init") {
            throw new Error("task has been started");
        }

        this.#setState("start");

        if (typeof this.#excutor === "function") {
            const onDone = () => {
                this.#setState("done");
                this.#onDone?.();
            };
            const onError = (err: unknown) => {
                this.#setState("error");
                this.#onError?.(err);
            };
            try {
                const ret = this.#excutor();
                this.#setState("running");

                const promise =
                    ret && typeof ret.then === "function"
                        ? ret
                        : Promise.resolve(ret);
                promise.then(onDone);
            } catch (error) {
                onError(error);
                throw error;
            }
        }
    }
}

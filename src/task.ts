/**
 *  队列自增长id
 */
let taskId: number = 0;

/** 任务类 */
export default class Task {
    id: number = 0;
    excutor: () => void | Promise<void>;
    #id: number = 0;
    #promise?: Promise<void>;
    #excutor: () => void | Promise<void>;
    constructor(excutor: () => void | Promise<void>) {
        if (typeof excutor !== "function") {
            throw new Error("fn must be function");
        }

        this.#excutor = excutor;
        this.#id = ++taskId;

        Object.defineProperties(this, {
            id: {
                enumerable: true,
                configurable: false,
                get: () => this.#id,
                set: () => null,
            },
            excutor: {
                enumerable: true,
                configurable: false,
                get: () => this.#excutor,
                set: () => null,
            },
        });
        this.excutor = excutor;
    }

    /**
     * 开始执行任务
     */
    async start() {
        if (this.#promise) {
            return this.#promise;
        }

        const ret = this.#excutor();

        const promise =
            ret && typeof ret.then === "function" ? ret : Promise.resolve(ret);
        this.#promise = promise;
        return await promise;
    }
}

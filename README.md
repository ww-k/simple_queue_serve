# simple-queue-serve

这是一个轻量的 JavaScript/TypeScript 异步任务队列服务库（QueueService）与任务抽象（Task），用于在浏览器或 Node 环境中以可控并发、安全的状态管理来执行异步任务。

## 主要目的

- 提供一个简单、可配置的任务队列（并发数、任务间隔），支持暂停/恢复、停止与中止。
- 每个任务封装为 `Task` 对象，带有状态管理与生命周期钩子，方便观察与错误处理。

## 特性

- 并发控制（concurrency）和执行间隔（interval）。
- 任务排队（push / unshift）、移除与清空。
- 支持队列状态事件：running、pause、stopping、done、resume 等。
- 任务事件与进度回调（taskstart、progress、taskerror）。
- 轻量，无外部运行时依赖（代码中仅用于事件发射的 `mitt`）。

## 安装

You can install the package via npm:

```
npm install simple-queue-serve
```

可用脚本：

- `pnpm build` - 使用 rslib 打包
- `pnpm dev` - 打包并开启 watch
- `pnpm test` - 运行测试（如果存在）

## 使用示例

构建后在发布包或项目内引用：

示例

```ts
import QueueService, { Task } from 'simple-queue-serve';

const q = new QueueService({ concurrency: 3, interval: 50 });

q.on('taskstart', (task) => console.log('开始任务', task.id));
q.on('taskend', (p) => console.log('进度', p));
q.on('taskerror', (p) => console.log('进度', p));
q.start();

q.push(() => Promise.resolve(console.log('简单函数任务')));

class ComplexTask extends Task {
    constructor() {
        super({
            excutor: () => {
                return this.#start();
            }
        });
    }

    async #start() {
        console.log('复杂任务开始');
    }
}

q.push(new ComplexTask());

```

## API 摘要

- QueueService(option?)
	- option.concurrency: 并发数（默认 5）
	- option.interval: 每次调度的间隔 ms（默认 25）
	- 方法：start(), stop(), pause(), resume(), abort(), push(fn|Task), unshift(fn|Task), remove(task), clear(), forEach(cb), on(event, handler), off(event, handler)

- Task
	- 构造：new Task({ excutor: () => void | Promise<void>, onDone?, onError? })
	- 方法：start()
	- 属性：id, state, excutor

- QueueService Events
```
type IEvents<T extends Task> = {
    running: undefined;
    pause: undefined;
    stopping: undefined;
    done: undefined;
    resume: IQueueState;
    idle: undefined;
    taskdone: {
        running: number;
        pending: number;
        result?: unknown;
        task: T;
    };
    taskstart: {
        running: number;
        pending: number;
        task: T;
    };
    taskerror: {
        running: number;
        pending: number;
        err?: unknown;
        task: T;
    };
};
```
更多实现细节请参阅 `src/index.ts` 与 `src/task.ts`。

## 贡献与许可

欢迎提交 issue 或 PR 来改进功能或修复 bug。请参见仓库中的贡献指南（如有）。

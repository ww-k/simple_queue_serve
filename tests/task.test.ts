import { expect, rs, test } from "@rstest/core";

import Task from "../src/task";

test("[Task] sync task completes to done", async () => {
    const taskFn = rs.fn(() => {});
    const task = new Task(taskFn);
    const promise = task.start();
    await promise;
    expect(taskFn).toHaveBeenCalledTimes(1);
});

test("[Task] async task completes", async () => {
    const taskFn = rs.fn(
        () => new Promise((res) => setTimeout(res, 20)),
    ) as () => Promise<void>;
    const task = new Task(taskFn);
    const promise = task.start();
    await promise;
    expect(taskFn).toHaveBeenCalledTimes(1);
});

test("[Task] async task completes to be error", async () => {
    const taskFn = rs.fn(
        () => new Promise((_, reject) => setTimeout(reject, 20)),
    ) as () => Promise<void>;
    const task = new Task(taskFn);
    const promise = task.start();
    try {
        await promise;
    } catch {
        expect(taskFn).toHaveBeenCalledTimes(1);
    }
});

test("[Task] start twice", async () => {
    const taskFn = rs.fn(
        () => new Promise((res) => setTimeout(res, 20)),
    ) as () => Promise<void>;
    const task = new Task(taskFn);
    const promise = task.start();
    const promise2 = task.start();
    expect(promise).toStrictEqual(promise2);
    await promise;
    expect(taskFn).toHaveBeenCalledTimes(1);
});

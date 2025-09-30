import { expect, test } from "@rstest/core";

import Task from "../src/task";

test("[Task] sync task completes to done", async () => {
    const task = new Task({ excutor: () => {} });
    const promise = task.start();
    expect(task.state).toBe("running");
    await promise;
    expect(task.state).toBe("done");
});

test("[Task] async task completes", async () => {
    const task = new Task({
        excutor: () => new Promise((res) => setTimeout(res, 20)),
    });
    const promise = task.start();
    expect(task.state).toBe("running");
    await promise;
    expect(task.state).toBe("done");
});

test("[Task] async task completes to be error", async () => {
    const task = new Task({
        excutor: () => new Promise((_, reject) => setTimeout(reject, 20)),
    });
    expect.assertions(2);
    const promise = task.start();
    expect(task.state).toBe("running");
    try {
        await promise;
    } catch {
        expect(task.state).toBe("error");
    }
});

test("[Task] start twice", async () => {
    const task = new Task({
        excutor: () => new Promise((res) => setTimeout(res, 20)),
    });
    expect.assertions(2);
    const promise = task.start();
    const promise2 = task.start();
    expect(promise).toStrictEqual(promise2);
    await promise;
    expect(task.state).toBe("done");
});

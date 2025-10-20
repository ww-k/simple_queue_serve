import { expect, rs, test } from "@rstest/core";

import QueueService, { Task } from "../src/index";

test("[QueueService] queue starts and changes state", async () => {
    const queueService = new QueueService();
    const queueServiceIdleHandle = rs.fn(() => {});
    const queueServicePauseHandle = rs.fn(() => {
        expect(queueService.state).toBe("pause");
    });
    const queueServiceResumeHandle = rs.fn((preState) => {
        expect(queueService.state).toBe(preState);
    });
    const taskdoneHandle = rs.fn(() => {});
    const taskerrorHandle = rs.fn(() => {});
    const taskstartHandle = rs.fn(() => {});

    await new Promise<void>((resolve) => {
        queueService.on("idle", queueServiceIdleHandle);
        queueService.on("pause", queueServicePauseHandle);
        queueService.on("resume", queueServiceResumeHandle);
        queueService.on("taskdone", taskdoneHandle);
        queueService.on("taskerror", taskerrorHandle);
        queueService.on("taskstart", taskstartHandle);

        expect(queueService.state).toBe("running");

        const resolveTask = () =>
            new Promise((resolve1) => setTimeout(resolve1, 20));
        const rejectTask = () =>
            new Promise((_, reject) => setTimeout(reject, 20));
        queueService.push(resolveTask);
        queueService.push(resolveTask);
        queueService.push(rejectTask);
        queueService.push(rejectTask);
        queueService.push(resolveTask);
        queueService.push(resolveTask);

        setTimeout(() => {
            queueService.pause();
        }, 100);
        setTimeout(() => {
            queueService.resume();
        }, 200);
        setTimeout(() => {
            resolve();
        }, 300);
    });
    expect(queueServiceIdleHandle).toHaveBeenCalledTimes(2);
    expect(queueServicePauseHandle).toHaveBeenCalledTimes(1);
    expect(queueServiceResumeHandle).toHaveBeenCalledTimes(1);
    expect(taskdoneHandle).toHaveBeenCalledTimes(4);
    expect(taskerrorHandle).toHaveBeenCalledTimes(2);
    expect(taskstartHandle).toHaveBeenCalledTimes(6);
});

test("[QueueService] ComplexTask", async () => {
    const queueService = new QueueService();
    const taskFn = rs.fn(() => {});
    class ComplexTask extends Task {
        constructor() {
            super(() => {
                return this.#start();
            });
        }

        async #start() {
            taskFn();
        }
    }

    queueService.push(new ComplexTask());

    await new Promise<void>((resolve) => {
        setTimeout(() => {
            resolve();
        }, 300);
    });

    expect(taskFn).toHaveBeenCalledTimes(1);
});

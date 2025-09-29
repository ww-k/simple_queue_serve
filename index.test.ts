import { expect, test } from "@rstest/core";

import QueueService from "./src/index";

const queueService = new QueueService();

test("queue service", () => {
    queueService.start();
    expect(queueService.state).toBe("running");
});

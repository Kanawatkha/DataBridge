import { describe, expect, it } from "bun:test";
import { RetryHandler } from "./retry-handler";

describe("RetryHandler", () => {
  it("should return the value immediately on first success", async () => {
    let calls = 0;
    const task = async () => {
      calls++;
      return "success-value";
    };

    const result = await RetryHandler.retry(task, "Test Immediate", 3, "fixed");
    expect(result).toBe("success-value");
    expect(calls).toBe(1);
  });

  it("should retry and succeed if an error occurs but resolves later", async () => {
    let calls = 0;
    const task = async () => {
      calls++;
      if (calls === 1) {
        throw new Error("Temporary failure");
      }
      return "retry-success";
    };

    const result = await RetryHandler.retry(task, "Test Transient", 3, "fixed");
    expect(result).toBe("retry-success");
    expect(calls).toBe(2);
  });

  it("should fail and throw final error after max retries are exhausted", async () => {
    let calls = 0;
    const task = async () => {
      calls++;
      throw new Error("Persistent failure");
    };

    let errorThrown: any = null;
    try {
      await RetryHandler.retry(task, "Test Exhaust", 3, "fixed");
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.message).toBe("Persistent failure");
    expect(calls).toBe(3);
  });
});

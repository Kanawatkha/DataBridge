import { logger } from "../logging/logger";

export class RetryHandler {
  /**
   * Wraps an asynchronous function with retry logic.
   * Delays retries using either a fixed wait time (1000ms) or exponential backoff.
   */
  static async retry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries: number,
    backoff: "exponential" | "fixed"
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await fn();
      } catch (error: any) {
        attempt++;
        if (attempt >= maxRetries) {
          logger.error(`Operation "${label}" failed after ${attempt} attempts. Final error: ${error.message}`);
          throw error;
        }

        // Calculate backoff delay
        const delay = backoff === "exponential"
          ? 1000 * Math.pow(2, attempt - 1)
          : 1000;

        logger.warn(
          `Operation "${label}" failed (attempt ${attempt}/${maxRetries}). Error: ${error.message}. Retrying in ${delay}ms...`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

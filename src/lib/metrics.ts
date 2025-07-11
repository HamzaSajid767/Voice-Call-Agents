type MetricsSnapshot = {
  totalRequests: number;
  totalErrors: number;
  activeCalls: number;
  avgResponseMs: number;
};

class Metrics {
  private totalRequests = 0;
  private totalErrors = 0;
  private totalResponseMs = 0;
  private totalResponses = 0;
  private activeCalls = 0;

  public incRequest(): void {
    this.totalRequests += 1;
  }
  public incError(): void {
    this.totalErrors += 1;
  }
  public observeResponse(ms: number): void {
    this.totalResponseMs += ms;
    this.totalResponses += 1;
  }
  public setActiveCalls(count: number): void {
    this.activeCalls = count;
  }

  public snapshot(): MetricsSnapshot {
    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      activeCalls: this.activeCalls,
      avgResponseMs: this.totalResponses ? this.totalResponseMs / this.totalResponses : 0
    };
  }
}

export const metrics = new Metrics();


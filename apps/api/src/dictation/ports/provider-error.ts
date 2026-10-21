export class ProviderError extends Error {
  readonly provider: string;
  readonly status: number | undefined;

  constructor(provider: string, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}

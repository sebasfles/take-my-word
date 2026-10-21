export class InvalidAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAudioError";
  }
}

export class AudioTooShortError extends Error {
  constructor() {
    super("audio is too short");
    this.name = "AudioTooShortError";
  }
}

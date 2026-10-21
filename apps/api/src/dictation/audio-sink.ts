import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { AudioContainer } from "@take-my-word/shared";

export interface AudioSink {
  put(input: {
    userId: string;
    requestId: string;
    createdAt: Date;
    audio: { container: AudioContainer; bytes: Buffer };
  }): Promise<void>;
}

const contentTypes = { wav: "audio/wav", m4a: "audio/mp4" } as const;

export function s3DebugAudioSink(client: S3Client, bucket: string): AudioSink {
  return {
    async put({ userId, requestId, createdAt, audio }) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${userId}/${createdAt.toISOString()}-${requestId}.${audio.container}`,
          Body: audio.bytes,
          ContentType: contentTypes[audio.container],
        }),
      );
    },
  };
}

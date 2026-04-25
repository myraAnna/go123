import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION ?? 'ap-southeast-1';

const client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
});

export async function uploadBuffer(
  key: string,
  buffer: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: Buffer.from(buffer),
      ContentType: contentType,
    }),
  );
}

const ONE_DAY_SECONDS = 24 * 60 * 60;

export function getPresignedUrl(key: string, expiresIn: number = ONE_DAY_SECONDS): string {
  return Bun.S3Client.presign(key, {
    bucket: process.env.S3_BUCKET!,
    region,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    method: 'GET',
    expiresIn,
  });
}

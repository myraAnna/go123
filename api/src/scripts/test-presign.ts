import { uploadBuffer, getPresignedUrl } from '../clients/s3.js';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION ?? 'ap-southeast-1';
const bucket = process.env.S3_BUCKET;

if (!bucket || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('Missing env: S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
  process.exit(1);
}

// 1x1 transparent PNG
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const key = `__presign-check/${Date.now()}.png`;

async function main() {
  console.log(`Bucket : ${bucket}`);
  console.log(`Region : ${region}`);
  console.log(`Key    : ${key}`);
  console.log('');

  console.log('1/3 Upload tiny PNG via uploadBuffer');
  await uploadBuffer(key, PNG_1x1.buffer.slice(PNG_1x1.byteOffset, PNG_1x1.byteOffset + PNG_1x1.byteLength), 'image/png');
  console.log('    ok');

  console.log('2/3 Generate presigned URL (1 day)');
  const url = getPresignedUrl(key);
  console.log(`    ${url}`);
  console.log('');

  console.log('3/3 Fetch URL to verify it serves the object');
  const res = await fetch(url);
  console.log(`    status         : ${res.status}`);
  console.log(`    content-type   : ${res.headers.get('content-type')}`);
  console.log(`    content-length : ${res.headers.get('content-length')}`);
  if (!res.ok) {
    const body = await res.text();
    console.error('    body           :', body);
    throw new Error(`presigned URL fetch failed: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.equals(PNG_1x1)) {
    throw new Error(`roundtrip mismatch: got ${buf.length} bytes, expected ${PNG_1x1.length}`);
  }
  console.log('    ok (bytes match)');

  console.log('\nCleanup');
  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
  });
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log('    deleted test object');

  console.log('\nPresign generation healthy.');
}

main().catch((err) => {
  console.error('\nPresign check failed:');
  console.error(err);
  process.exit(1);
});

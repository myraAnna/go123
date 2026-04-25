import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || undefined;

if (!region || !bucket || !accessKeyId || !secretAccessKey) {
  console.error('Missing env vars. Need: AWS_REGION, S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
  process.exit(1);
}

const s3 = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey, sessionToken },
});

const key = `__healthcheck/${Date.now()}.txt`;
const body = `warung-ai s3 connectivity check @ ${new Date().toISOString()}`;

async function main() {
  console.log(`Region : ${region}`);
  console.log(`Bucket : ${bucket}`);
  console.log(`Key id : ${accessKeyId!.slice(0, 4)}…${accessKeyId!.slice(-4)}`);
  console.log('');

  console.log('0/4 ListBuckets — auth smoke test (no bucket-level perms needed beyond s3:ListAllMyBuckets)');
  try {
    const r = await s3.send(new ListBucketsCommand({}));
    console.log(`     ok (${r.Buckets?.length ?? 0} buckets visible)`);
  } catch (e: any) {
    console.log(`     skipped (${e.name}: ${e.message}) — IAM user may not have ListAllMyBuckets, that's fine`);
  }

  console.log('1/4 HeadBucket  — can we see the bucket?');
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log('     ok');

  console.log(`2/4 PutObject   — write ${key}`);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' }));
  console.log('     ok');

  console.log('3/4 GetObject   — read it back');
  const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const text = await got.Body!.transformToString();
  if (text !== body) throw new Error(`roundtrip mismatch: got "${text}"`);
  console.log('     ok (roundtrip matches)');

  console.log('4/4 DeleteObject — clean up');
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log('     ok');

  console.log('\nS3 connection healthy.');
}

main().catch((err) => {
  console.error('\nS3 check failed:');
  console.error(`  name      : ${err.name}`);
  console.error(`  message   : ${err.message}`);
  if (err.Code) console.error(`  code      : ${err.Code}`);
  if (err.$metadata?.httpStatusCode) console.error(`  http      : ${err.$metadata.httpStatusCode}`);
  if (err.$metadata?.requestId) console.error(`  requestId : ${err.$metadata.requestId}`);
  if (err.$response?.headers) {
    const h = err.$response.headers;
    if (h['x-amz-bucket-region']) console.error(`  bucket-region (from S3): ${h['x-amz-bucket-region']}`);
  }
  console.error('\nFull error:');
  console.error(err);
  process.exit(1);
});

import type { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { WorkerConfig } from './config.js';

export class ObjectStorage {
  readonly client: S3Client;

  constructor(private readonly config: WorkerConfig) {
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  get buckets() {
    return { documents: this.config.S3_BUCKET_DOCUMENTS, quarantine: this.config.S3_BUCKET_QUARANTINE };
  }

  /** The worker must not depend on the API having started first (some S3 stores return InternalError, not NoSuchBucket). */
  async ensureBuckets(): Promise<void> {
    for (const bucket of Object.values(this.buckets)) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
        } catch (err) {
          // Another process may have created it concurrently.
          const name = (err as Error).name;
          if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw err;
        }
      }
    }
  }

  async stream(bucket: string, key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return res.Body as Readable;
  }

  async copy(fromBucket: string, toBucket: string, key: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({ Bucket: toBucket, Key: key, CopySource: `${fromBucket}/${encodeURI(key)}` }),
    );
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

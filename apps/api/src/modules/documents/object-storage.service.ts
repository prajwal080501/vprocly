import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config.js';

/** Thin wrapper over the S3 API so any S3-compatible store (SeaweedFS, MinIO, Ceph, AWS) works. */
@Injectable()
export class ObjectStorage implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorage.name);
  readonly client: S3Client;
  /** Signs URLs reachable from wherever the Excel service runs, which is not always the same network
   *  context as this API (e.g. in CI or Kubernetes the Excel service is containerized and cannot resolve
   *  "localhost" as this process's host). Falls back to `client` when they are the same. A presigned URL's
   *  signature covers the Host header, so this cannot be done by string-editing the URL after signing --
   *  it needs its own client constructed with the right endpoint from the start. */
  private readonly excelFetchClient: S3Client;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const base = {
      region: config.S3_REGION,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      // Otherwise the SDK signs a checksum of the (empty) body into presigned PUTs and the real upload is
      // rejected as BadDigest by S3-compatible stores.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
      credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
    };
    this.client = new S3Client({ ...base, endpoint: config.S3_ENDPOINT });
    this.excelFetchClient = config.S3_EXCEL_ENDPOINT ? new S3Client({ ...base, endpoint: config.S3_EXCEL_ENDPOINT }) : this.client;
  }

  get buckets() {
    return { documents: this.config.S3_BUCKET_DOCUMENTS, quarantine: this.config.S3_BUCKET_QUARANTINE };
  }

  async onModuleInit() {
    for (const bucket of Object.values(this.buckets)) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
        this.logger.log(`created bucket ${bucket}`);
      }
    }
  }

  presignPut(bucket: string, key: string, contentType: string, contentLength: number, expiresIn = 600) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
      { expiresIn },
    );
  }

  presignGet(bucket: string, key: string, fileName: string, expiresIn = 300) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\\r\n]/g, '_')}"`,
      }),
      { expiresIn },
    );
  }

  /** For a URL that only the Excel service will fetch (never a browser) -- see excelFetchClient above. */
  presignGetForExcelService(bucket: string, key: string, expiresIn = 300) {
    return getSignedUrl(this.excelFetchClient, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
  }

  async head(bucket: string, key: string) {
    try {
      return await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      return null;
    }
  }

  async sha256(bucket: string, key: string): Promise<string> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const hash = createHash('sha256');
    for await (const chunk of res.Body as Readable) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }
}

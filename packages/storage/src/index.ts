import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface StorageConfig {
  endpoint: string;
  publicUrl: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

const PUBLIC_PREFIX = "public/";

export class Storage {
  private readonly s3: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.s3 = new S3Client({
      endpoint: config.endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });
  }

  /** Only the public/ prefix is anonymously readable, because Google fetches images by URL. */
  async ensureBucket(): Promise<void> {
    const Bucket = this.config.bucket;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket }));
    }
    await this.s3.send(
      new PutBucketPolicyCommand({
        Bucket,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: ["*"] },
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${Bucket}/${PUBLIC_PREFIX}*`],
            },
          ],
        }),
      }),
    );
  }

  async ping(): Promise<void> {
    await this.s3.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
  }

  publicKey(path: string): string {
    return `${PUBLIC_PREFIX}${path}`;
  }

  publicUrl(key: string): string {
    return `${this.config.publicUrl.replace(/\/$/, "")}/${key}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string): Promise<Buffer> {
    const { Body } = await this.s3.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    if (!Body) throw new Error("Storage returned no data");
    return Buffer.from(await Body.transformToByteArray());
  }

  async copy(from: string, to: string): Promise<void> {
    await this.s3.send(new CopyObjectCommand({ Bucket: this.config.bucket, Key: to, CopySource: `${this.config.bucket}/${from}` }));
  }

  async remove(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

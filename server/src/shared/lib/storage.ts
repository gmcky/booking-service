import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type S3ObjectRef = {
  bucket: string;
  key: string;
  region?: string;
};

function parseVirtualHostStyle(host: string): { bucket: string; region?: string } | null {
  const match = host.match(/^([^.]+)\.s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com$/i);
  if (!match) return null;

  const bucket = match[1];
  if (!bucket) return null;

  return {
    bucket,
    region: match[2],
  };
}

function parseS3Url(rawUrl: string): S3ObjectRef | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol === "s3:") {
    const bucket = url.hostname;
    const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!bucket || !key) return null;

    return { bucket, key };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }

  const virtualHost = parseVirtualHostStyle(url.hostname);
  if (virtualHost) {
    const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!key) return null;

    return {
      bucket: virtualHost.bucket,
      key,
      region: virtualHost.region,
    };
  }

  return null;
}

export async function deleteFromS3(fileUrl: string): Promise<void> {
  const parsed = parseS3Url(fileUrl);
  if (!parsed) {
    throw new Error("Unsupported S3 URL format");
  }

  const region = parsed.region || process.env.AWS_REGION || "us-east-1";
  const client = new S3Client({ region });

  await client.send(
    new DeleteObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    }),
  );
}

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is not configured");
  }

  const region = process.env.AWS_REGION || "us-east-1";
  const client = new S3Client({ region });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

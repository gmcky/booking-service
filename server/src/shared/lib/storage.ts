import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type S3ObjectRef = {
  bucket: string;
  key: string;
  region?: string;
};

/**
 * Base URL avatars are publicly served from (no trailing slash).
 * Required for S3-compatible providers like R2 whose API endpoint is not
 * publicly readable; empty on plain AWS where the virtual-host URL works.
 */
function publicBaseUrl(): string {
  return (process.env.S3_PUBLIC_URL ?? "").replace(/\/+$/, "");
}

function createClient(region?: string): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  return new S3Client({
    region: region || process.env.AWS_REGION || "us-east-1",
    // Path-style avoids bucket-subdomain DNS assumptions on non-AWS endpoints.
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

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

  // Objects under the configured public base map to keys in the configured bucket.
  const publicBase = publicBaseUrl();
  if (publicBase && rawUrl.startsWith(`${publicBase}/`)) {
    const bucket = process.env.S3_BUCKET;
    const key = decodeURIComponent(rawUrl.slice(publicBase.length + 1));
    if (!bucket || !key) return null;

    return { bucket, key };
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

  const client = createClient(parsed.region);

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
  const client = createClient();

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

  const publicBase = publicBaseUrl();
  return publicBase
    ? `${publicBase}/${encodedKey}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

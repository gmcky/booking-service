import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("11111111-1111-1111-1111-111111111111"),
}));

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheGetNamespaceVersion: vi.fn().mockResolvedValue("0"),
  cacheInvalidateNamespace: vi.fn(),
  hashKey: vi.fn(() => "hash"),
}));

vi.mock("../../shared/queues/image.queue.js", () => ({
  imageQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../shared/queues/cleanup.queue.js", () => ({
  cleanupQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../modules/users/user.stats.cache.js", () => ({
  invalidateUserStatsCache: vi.fn().mockResolvedValue(undefined),
}));

import { mkdir, writeFile } from "node:fs/promises";
import { cleanupQueue } from "../../shared/queues/cleanup.queue.js";
import { PropertyService } from "../../modules/properties/property.service.js";

const mockMkdir = mkdir as unknown as ReturnType<typeof vi.fn>;
const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;
const mockCleanupAdd = cleanupQueue.add as unknown as ReturnType<typeof vi.fn>;

function makeFile(originalname: string, buffer = Buffer.from("data")): Express.Multer.File {
  return {
    fieldname: "images",
    originalname,
    encoding: "7bit",
    mimetype: "image/jpeg",
    buffer,
    size: buffer.length,
  } as Express.Multer.File;
}

describe("PropertyService.saveRawImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes one file per input file and calls mkdir recursively", async () => {
    const files = [makeFile("a.jpg"), makeFile("b.png")];

    await PropertyService.saveRawImages("user-1", files);

    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(mockMkdir).toHaveBeenCalledTimes(2);
    for (const call of mockMkdir.mock.calls) {
      expect(call[1]).toEqual({ recursive: true });
    }
  });

  it("returns relative paths matching uploads/property-temp/<userId>-<uuid>", async () => {
    const files = [makeFile("a.jpg")];

    const paths = await PropertyService.saveRawImages("user-42", files);

    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe("uploads/property-temp/user-42-11111111-1111-1111-1111-111111111111");
  });

  it("schedules a delayed orphan-cleanup job for the written paths", async () => {
    const files = [makeFile("a.jpg")];

    const paths = await PropertyService.saveRawImages("user-1", files);

    expect(mockCleanupAdd).toHaveBeenCalledTimes(1);
    expect(mockCleanupAdd).toHaveBeenCalledWith(
      "unlink-property-images",
      { paths },
      { delay: 24 * 60 * 60 * 1000 },
    );
  });

  it("passes each file's buffer to writeFile", async () => {
    const bufferA = Buffer.from("image-a");
    const bufferB = Buffer.from("image-b");
    const files = [makeFile("a.jpg", bufferA), makeFile("b.jpg", bufferB)];

    await PropertyService.saveRawImages("user-1", files);

    expect(mockWriteFile.mock.calls[0]?.[1]).toBe(bufferA);
    expect(mockWriteFile.mock.calls[1]?.[1]).toBe(bufferB);
  });

  it("returns an empty array when given no files", async () => {
    const paths = await PropertyService.saveRawImages("user-1", []);

    expect(paths).toEqual([]);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockCleanupAdd).not.toHaveBeenCalled();
  });
});

describe("PropertyService.create rawImagePaths ownership guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeCreateInput(rawImagePaths: string[]) {
    return {
      title: "Test listing title",
      description: "A description long enough to pass validation checks",
      type: "APARTMENT",
      city: "Kyiv",
      address: "1 Test Street",
      pricePerNight: 100,
      maxGuests: 2,
      amenities: [],
      rawImagePaths,
      ownerId: "owner-1",
    };
  }

  it("rejects paths not owned by the caller with 400", async () => {
    const { prisma } = await import("../../shared/lib/prisma.js");

    await expect(
      PropertyService.create(
        makeCreateInput(["uploads/property-temp/other-user-some-uuid"]) as never,
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: "Invalid image path" });

    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("rejects processed-image paths outside the temp prefix", async () => {
    const { prisma } = await import("../../shared/lib/prisma.js");

    await expect(
      PropertyService.create(
        makeCreateInput(["uploads/properties/existing-prop/image.webp"]) as never,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.property.create).not.toHaveBeenCalled();
  });
});

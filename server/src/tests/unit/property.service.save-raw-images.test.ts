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
import { PropertyService } from "../../modules/properties/property.service.js";

const mockMkdir = mkdir as unknown as ReturnType<typeof vi.fn>;
const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;

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

  it("returns relative paths matching uploads/properties/temp/<userId>-<uuid>", async () => {
    const files = [makeFile("a.jpg")];

    const paths = await PropertyService.saveRawImages("user-42", files);

    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe("uploads/properties/temp/user-42-11111111-1111-1111-1111-111111111111");
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
  });
});

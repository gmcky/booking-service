import { apiClient } from "./client";
import { unwrap, unwrapVoid } from "./unwrap";
import type { components, paths } from "./schema";

export type PropertyType = components["schemas"]["PropertyType"];
export type Amenity = components["schemas"]["Amenity"];
export type PropertySort = "price_asc" | "price_desc" | "newest";

export type Property = components["schemas"]["PropertyWithOwner"];
export type PropertyDetail = components["schemas"]["PropertyDetail"];
export type PropertyReview = components["schemas"]["PropertyReview"];
export type HostProperty = components["schemas"]["Property"];

export interface Paginated<T> {
  data: T[];
  pagination: components["schemas"]["Pagination"];
}

export interface PropertyQuery {
  city?: string;
  type?: PropertyType;
  amenities?: string[];
  minPrice?: number;
  maxPrice?: number;
  maxGuests?: number;
  sort?: PropertySort;
  page?: number;
  limit?: number;
  checkIn?: string;
  checkOut?: string;
}

export interface CreatePropertyInput {
  title: string;
  description: string;
  type: PropertyType;
  city: string;
  address: string;
  pricePerNight: number;
  maxGuests: number;
  amenities: string[];
  rawImagePaths?: string[];
}

/** PATCH accepts finalized image URLs only — no raw upload paths on update. */
export type UpdatePropertyInput = Omit<Partial<CreatePropertyInput>, "rawImagePaths">;

type UploadImagesBody =
  paths["/properties/images"]["post"]["requestBody"]["content"]["multipart/form-data"];

export const propertyApi = {
  search: async (query: PropertyQuery = {}): Promise<Paginated<Property>> => {
    const { data, error, response } = await apiClient.GET("/properties", {
      params: {
        query: {
          city: query.city,
          type: query.type,
          amenities: query.amenities?.length ? query.amenities.join(",") : undefined,
          minPrice: query.minPrice,
          maxPrice: query.maxPrice,
          maxGuests: query.maxGuests,
          sort: query.sort,
          page: query.page,
          limit: query.limit,
          checkIn: query.checkIn,
          checkOut: query.checkOut,
        },
      },
    });
    return unwrap({ data, error, response });
  },

  byId: async (id: string): Promise<PropertyDetail> => {
    const { data, error, response } = await apiClient.GET("/properties/{id}", {
      params: { path: { id } },
    });
    return unwrap({ data, error, response });
  },

  mine: async (): Promise<Paginated<HostProperty>> => {
    const { data, error, response } = await apiClient.GET("/properties/my");
    return unwrap({ data, error, response });
  },

  create: async (input: CreatePropertyInput): Promise<HostProperty> => {
    const { data, error, response } = await apiClient.POST("/properties", {
      body: {
        ...input,
        amenities: input.amenities as Amenity[],
        rawImagePaths: input.rawImagePaths ?? [],
      },
    });
    return unwrap({ data, error, response });
  },

  update: async (id: string, input: UpdatePropertyInput): Promise<HostProperty> => {
    const { data, error, response } = await apiClient.PATCH("/properties/{id}", {
      params: { path: { id } },
      body: { ...input, amenities: input.amenities as Amenity[] | undefined },
    });
    return unwrap({ data, error, response });
  },

  /**
   * Multipart upload; same FormData-through-typed-client cast as
   * userApi.updateProfile (openapi-fetch passes FormData straight through).
   */
  uploadImages: async (files: File[]): Promise<{ paths: string[] }> => {
    const form = new FormData();
    for (const file of files) form.append("images", file);
    const { data, error, response } = await apiClient.POST("/properties/images", {
      body: form as unknown as UploadImagesBody,
    });
    return unwrap({ data, error, response });
  },

  setActive: async (id: string, active: boolean): Promise<HostProperty> => {
    const { data, error, response } = active
      ? await apiClient.POST("/properties/{id}/activate", { params: { path: { id } } })
      : await apiClient.POST("/properties/{id}/deactivate", { params: { path: { id } } });
    return unwrap({ data, error, response });
  },

  remove: async (id: string): Promise<void> => {
    const { error, response } = await apiClient.DELETE("/properties/{id}", {
      params: { path: { id } },
    });
    unwrapVoid({ error, response });
  },
};

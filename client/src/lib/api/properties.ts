import { apiClient } from "./client";
import { unwrap, unwrapVoid } from "./unwrap";
import type { components } from "./schema";

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
}

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
      body: { ...input, amenities: input.amenities as Amenity[], rawImagePaths: [] },
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

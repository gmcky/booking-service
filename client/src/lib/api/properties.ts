import { apiClient } from "./client";
import { unwrap, unwrapVoid } from "./unwrap";
import type { components, paths } from "./schema";

/**
 * The backend's create/update property validators accept `petsAllowed` /
 * `infantsAllowed` (server/src/modules/properties/property.validators.ts),
 * but the OpenAPI doc for those two request bodies hasn't been updated to
 * declare them (only the search-query and response schemas were) — so the
 * generated `paths[...]["post"|"patch"]["requestBody"]` types omit them.
 * These extend the generated body types so the fields can be sent without
 * an unsafe cast; remove once the backend's OpenAPI doc catches up.
 */
type CreatePropertyBody = paths["/properties"]["post"]["requestBody"]["content"]["application/json"] & {
  petsAllowed?: boolean;
  infantsAllowed?: boolean;
};
type UpdatePropertyBody = paths["/properties/{id}"]["patch"]["requestBody"]["content"]["application/json"] & {
  petsAllowed?: boolean;
  infantsAllowed?: boolean;
};

export type PropertyType = components["schemas"]["PropertyType"];
export type Amenity = components["schemas"]["Amenity"];
export type PropertySort = "price_asc" | "price_desc" | "newest";

export type Property = components["schemas"]["PropertyWithOwner"];
export type PropertyMapMarker = components["schemas"]["PropertyMapMarker"];
export type PropertyDetail = components["schemas"]["PropertyDetail"];
export type PropertyReview = components["schemas"]["PropertyReview"];
export type HostProperty = components["schemas"]["Property"];

export interface Paginated<T> {
  data: T[];
  pagination: components["schemas"]["Pagination"];
}

export type AddressSuggestion = components["schemas"]["AddressSuggestion"];

export type LocationCountry = components["schemas"]["LocationCountry"];
export type LocationCity = components["schemas"]["LocationCity"];
export type LocationDistrict = components["schemas"]["LocationDistrict"];

export interface PropertyQuery {
  ownerId?: string;
  city?: string;
  country?: string;
  district?: string;
  type?: PropertyType;
  amenities?: string[];
  minPrice?: number;
  maxPrice?: number;
  maxGuests?: number;
  petsAllowed?: boolean;
  infantsAllowed?: boolean;
  sort?: PropertySort;
  page?: number;
  limit?: number;
  checkIn?: string;
  checkOut?: string;
  /** Bounding-box filter — provide all four together or omit all four. */
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
}

export interface CreatePropertyInput {
  title: string;
  description: string;
  type: PropertyType;
  city: string;
  country: string;
  district?: string;
  street: string;
  houseNumber?: string;
  apartment?: string;
  /** Present only when the host picked an autocomplete suggestion —
   *  stores the suggestion's exact coordinates, skipping the geocoder. */
  latitude?: number;
  longitude?: number;
  pricePerNight: number;
  maxGuests: number;
  petsAllowed: boolean;
  infantsAllowed: boolean;
  amenities: string[];
  rawImagePaths?: string[];
}

/** PATCH accepts finalized image URLs only — no raw upload paths on update.
 *  Optional address parts take null so hosts can clear them. */
export type UpdatePropertyInput = Omit<
  Partial<CreatePropertyInput>,
  "rawImagePaths" | "district" | "houseNumber" | "apartment"
> & {
  district?: string | null;
  houseNumber?: string | null;
  apartment?: string | null;
};

type UploadImagesBody =
  paths["/properties/images"]["post"]["requestBody"]["content"]["multipart/form-data"];

export const propertyApi = {
  search: async (query: PropertyQuery = {}): Promise<Paginated<Property>> => {
    const { data, error, response } = await apiClient.GET("/properties", {
      params: {
        query: {
          ownerId: query.ownerId,
          city: query.city,
          country: query.country,
          district: query.district,
          type: query.type,
          amenities: query.amenities?.length ? query.amenities.join(",") : undefined,
          minPrice: query.minPrice,
          maxPrice: query.maxPrice,
          maxGuests: query.maxGuests,
          petsAllowed: query.petsAllowed,
          infantsAllowed: query.infantsAllowed,
          sort: query.sort,
          page: query.page,
          limit: query.limit,
          checkIn: query.checkIn,
          checkOut: query.checkOut,
          minLat: query.minLat,
          maxLat: query.maxLat,
          minLng: query.minLng,
          maxLng: query.maxLng,
        },
      },
    });
    return unwrap({ data, error, response });
  },

  /** Every match in the filter set (typically a map bbox), no pagination. */
  mapMarkers: async (query: PropertyQuery = {}): Promise<PropertyMapMarker[]> => {
    const { data, error, response } = await apiClient.GET("/properties/map-markers", {
      params: {
        query: {
          city: query.city,
          country: query.country,
          district: query.district,
          type: query.type,
          amenities: query.amenities?.length ? query.amenities.join(",") : undefined,
          minPrice: query.minPrice,
          maxPrice: query.maxPrice,
          maxGuests: query.maxGuests,
          petsAllowed: query.petsAllowed,
          infantsAllowed: query.infantsAllowed,
          checkIn: query.checkIn,
          checkOut: query.checkOut,
          minLat: query.minLat,
          maxLat: query.maxLat,
          minLng: query.minLng,
          maxLng: query.maxLng,
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

  locations: async (): Promise<LocationCountry[]> => {
    const { data, error, response } = await apiClient.GET("/properties/locations");
    return unwrap({ data, error, response });
  },

  /** Host-form autocomplete; street suggestions carry exact coordinates.
   *  country/city narrow the results and are only sent when long enough to
   *  pass validation. */
  suggestAddresses: async (
    q: string,
    opts: { kind?: "street" | "city"; country?: string; city?: string } = {},
  ): Promise<AddressSuggestion[]> => {
    const country = opts.country?.trim();
    const city = opts.city?.trim();
    const { data, error, response } = await apiClient.GET("/properties/address-suggest", {
      params: {
        query: {
          q,
          kind: opts.kind,
          country: country && country.length >= 2 ? country : undefined,
          city: city && city.length >= 2 ? city : undefined,
        },
      },
    });
    return unwrap({ data, error, response });
  },

  create: async (input: CreatePropertyInput): Promise<HostProperty> => {
    const body: CreatePropertyBody = {
      ...input,
      amenities: input.amenities as Amenity[],
      rawImagePaths: input.rawImagePaths ?? [],
    };
    const { data, error, response } = await apiClient.POST("/properties", { body });
    return unwrap({ data, error, response });
  },

  update: async (id: string, input: UpdatePropertyInput): Promise<HostProperty> => {
    const body: UpdatePropertyBody = {
      ...input,
      amenities: input.amenities as Amenity[] | undefined,
    };
    const { data, error, response } = await apiClient.PATCH("/properties/{id}", {
      params: { path: { id } },
      body,
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

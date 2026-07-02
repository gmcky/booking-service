import type { Options } from "swagger-jsdoc";
import { env } from "./env.js";

export const swaggerOptions: Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Booking Service API",
      version: "1.0.0",
      description: "Backend API for a property booking platform (Airbnb-like).",
      contact: {
        name: "API Support",
        email: "80690640+gmcky@users.noreply.github.com",
        url: "https://github.com/gmcky",
      },
      license: {
        name: "MIT",
      },
    },
    servers: [
      {
        url: `${env.PUBLIC_URL}/api/${env.API_VERSION}`,
        description:
          env.NODE_ENV === "production" ? "Production server" : "Local development server",
      },
    ],
    tags: [
      { name: "Auth", description: "Authentication and session management" },
      { name: "Users", description: "User profiles and admin user ops" },
      { name: "Properties", description: "Property listings and management" },
      { name: "Bookings", description: "Booking lifecycle and availability" },
      { name: "Payments", description: "Payments, refunds, Stripe webhook" },
      { name: "Reviews", description: "Property reviews and reports" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            details: { type: "object" },
          },
          required: ["error"],
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer" },
            limit: { type: "integer" },
            total: { type: "integer" },
            totalPages: { type: "integer" },
          },
        },

        // --- Enums ---
        Role: {
          type: "string",
          enum: ["USER", "ADMIN"],
        },
        PropertyType: {
          type: "string",
          enum: ["HOTEL_ROOM", "APARTMENT", "HOUSE", "MEETING_ROOM"],
        },
        Amenity: {
          type: "string",
          enum: [
            "WIFI",
            "AIR_CONDITIONING",
            "HEATING",
            "KITCHEN",
            "WASHER",
            "DRYER",
            "DISHWASHER",
            "PARKING",
            "POOL",
            "GYM",
            "BALCONY",
            "TERRACE",
            "ROOFTOP_TERRACE",
            "GARDEN",
            "BBQ",
            "FIREPLACE",
            "BATHTUB",
            "PRIVATE_BATHROOM",
            "TV",
            "SMART_TV",
            "COFFEE_MACHINE",
            "PROJECTOR",
            "STANDING_DESK",
            "ELEVATOR",
            "PET_FRIENDLY",
            "WHEELCHAIR_ACCESSIBLE",
            "SEA_VIEW",
            "CITY_CENTRE",
            "BEACHFRONT",
            "KIDS_PLAY_AREA",
            "BIKE_INCLUDED",
            "BIKE_RENTAL_NEARBY",
            "COURTYARD",
            "CANAL_VIEW",
            "RIVER_VIEW",
            "SUN_DECK",
            "KAYAK",
            "HISTORIC_BUILDING",
            "VINYL_RECORD_PLAYER",
            "BOOKS",
          ],
        },
        BookingStatus: {
          type: "string",
          enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"],
        },
        PayoutStatus: {
          type: "string",
          enum: ["PENDING", "READY", "PAID_OUT", "CANCELLED"],
        },
        PaymentStatus: {
          type: "string",
          enum: [
            "PENDING",
            "SUCCESS",
            "REFUND_PROCESSING",
            "REFUND_REQUESTED",
            "FAILED",
            "REFUNDED",
          ],
        },
        PaymentProvider: {
          type: "string",
          enum: ["STRIPE"],
        },
        ReviewReportStatus: {
          type: "string",
          enum: ["PENDING", "RESOLVED", "REJECTED"],
        },

        // --- Auth ---
        AuthUser: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            role: { $ref: "#/components/schemas/Role" },
          },
          required: ["id", "email", "firstName", "lastName", "role"],
        },
        AuthResponse: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/AuthUser" },
            accessToken: { type: "string" },
          },
          required: ["user", "accessToken"],
        },

        // --- Users ---
        CurrentUser: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            avatarUrl: { type: "string", nullable: true },
            isSuspended: { type: "boolean" },
            role: { $ref: "#/components/schemas/Role" },
            createdAt: { type: "string", format: "date-time" },
          },
          required: [
            "id",
            "email",
            "firstName",
            "lastName",
            "avatarUrl",
            "isSuspended",
            "role",
            "createdAt",
          ],
        },
        UserProfile: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            avatarUrl: { type: "string", nullable: true },
            phoneNumber: { type: "string", nullable: true },
            dateOfBirth: { type: "string", format: "date-time", nullable: true },
            bio: { type: "string", nullable: true },
            role: { $ref: "#/components/schemas/Role" },
          },
          required: [
            "id",
            "email",
            "firstName",
            "lastName",
            "avatarUrl",
            "phoneNumber",
            "dateOfBirth",
            "bio",
            "role",
          ],
        },
        PublicUserProfile: {
          type: "object",
          properties: {
            id: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            avatarUrl: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            averageRating: { type: "number", nullable: true },
            listingsCount: { type: "integer" },
          },
          required: [
            "id",
            "firstName",
            "lastName",
            "avatarUrl",
            "createdAt",
            "averageRating",
            "listingsCount",
          ],
        },
        UserStats: {
          type: "object",
          properties: {
            completedBookingsCount: { type: "integer" },
            completedNights: { type: "integer" },
            averageRatingAsGuest: { type: "number", nullable: true },
            averageRatingAsHost: { type: "number", nullable: true },
            listingsCount: { type: "integer" },
          },
          required: [
            "completedBookingsCount",
            "completedNights",
            "averageRatingAsGuest",
            "averageRatingAsHost",
            "listingsCount",
          ],
        },

        // --- Properties ---
        PropertyOwner: {
          type: "object",
          properties: {
            id: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
          },
          required: ["id", "firstName", "lastName"],
        },
        Property: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            type: { $ref: "#/components/schemas/PropertyType" },
            city: { type: "string" },
            address: { type: "string" },
            images: { type: "array", items: { type: "string" } },
            pricePerNight: {
              type: "string",
              description: "Decimal serialized as string",
            },
            maxGuests: { type: "integer" },
            amenities: {
              type: "array",
              items: { $ref: "#/components/schemas/Amenity" },
            },
            averageRating: {
              type: "string",
              nullable: true,
              description: "Decimal serialized as string",
            },
            reviewCount: { type: "integer" },
            ownerId: { type: "string" },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: [
            "id",
            "title",
            "description",
            "type",
            "city",
            "address",
            "images",
            "pricePerNight",
            "maxGuests",
            "amenities",
            "averageRating",
            "reviewCount",
            "ownerId",
            "isActive",
            "createdAt",
            "updatedAt",
          ],
        },
        PropertyWithOwner: {
          allOf: [
            { $ref: "#/components/schemas/Property" },
            {
              type: "object",
              properties: {
                owner: { $ref: "#/components/schemas/PropertyOwner" },
              },
              required: ["owner"],
            },
          ],
        },
        PropertyReview: {
          type: "object",
          properties: {
            id: { type: "string" },
            rating: { type: "integer" },
            comment: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            user: {
              type: "object",
              properties: {
                firstName: { type: "string" },
                lastName: { type: "string" },
              },
              required: ["firstName", "lastName"],
            },
            hostReplyText: { type: "string", nullable: true },
            hostReplyBy: {
              type: "object",
              nullable: true,
              properties: {
                firstName: { type: "string" },
                lastName: { type: "string" },
              },
              required: ["firstName", "lastName"],
            },
          },
          required: [
            "id",
            "rating",
            "comment",
            "createdAt",
            "user",
            "hostReplyText",
            "hostReplyBy",
          ],
        },
        PropertyDetail: {
          allOf: [
            { $ref: "#/components/schemas/PropertyWithOwner" },
            {
              type: "object",
              properties: {
                reviews: {
                  type: "array",
                  items: { $ref: "#/components/schemas/PropertyReview" },
                },
              },
              required: ["reviews"],
            },
          ],
        },

        // --- Payments ---
        Payment: {
          type: "object",
          properties: {
            id: { type: "string" },
            bookingId: { type: "string" },
            amount: {
              type: "string",
              description: "Decimal serialized as string",
            },
            currency: { type: "string" },
            status: { $ref: "#/components/schemas/PaymentStatus" },
            provider: { $ref: "#/components/schemas/PaymentProvider" },
            transactionId: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: [
            "id",
            "bookingId",
            "amount",
            "currency",
            "status",
            "provider",
            "transactionId",
            "createdAt",
            "updatedAt",
          ],
        },

        // --- Bookings ---
        BookingProperty: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            type: { $ref: "#/components/schemas/PropertyType" },
            city: { type: "string" },
            address: { type: "string" },
            images: { type: "array", items: { type: "string" } },
            pricePerNight: {
              type: "string",
              description: "Decimal serialized as string",
            },
            maxGuests: { type: "integer" },
            amenities: {
              type: "array",
              items: { $ref: "#/components/schemas/Amenity" },
            },
            averageRating: {
              type: "string",
              nullable: true,
              description: "Decimal serialized as string",
            },
            reviewCount: { type: "integer" },
            ownerId: { type: "string" },
          },
          required: [
            "id",
            "title",
            "description",
            "type",
            "city",
            "address",
            "images",
            "pricePerNight",
            "maxGuests",
            "amenities",
            "averageRating",
            "reviewCount",
            "ownerId",
          ],
        },
        Booking: {
          type: "object",
          properties: {
            id: { type: "string" },
            propertyId: { type: "string" },
            userId: { type: "string" },
            checkIn: { type: "string", format: "date-time" },
            checkOut: { type: "string", format: "date-time" },
            guests: { type: "integer" },
            totalPrice: {
              type: "string",
              description: "Decimal serialized as string",
            },
            status: { $ref: "#/components/schemas/BookingStatus" },
            payoutStatus: { $ref: "#/components/schemas/PayoutStatus" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            actualCheckOutAt: { type: "string", format: "date-time", nullable: true },
          },
          required: [
            "id",
            "propertyId",
            "userId",
            "checkIn",
            "checkOut",
            "guests",
            "totalPrice",
            "status",
            "payoutStatus",
            "createdAt",
            "updatedAt",
            "actualCheckOutAt",
          ],
        },
        BookingWithProperty: {
          allOf: [
            { $ref: "#/components/schemas/Booking" },
            {
              type: "object",
              properties: {
                property: { $ref: "#/components/schemas/BookingProperty" },
              },
              required: ["property"],
            },
          ],
        },
        BookingListItem: {
          allOf: [
            { $ref: "#/components/schemas/Booking" },
            {
              type: "object",
              properties: {
                property: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    city: { type: "string" },
                    images: { type: "array", items: { type: "string" } },
                  },
                  required: ["id", "title", "city", "images"],
                },
              },
              required: ["property"],
            },
          ],
        },
        HostBooking: {
          description:
            "Host booking list item. Diverges from a plain BookingWithProperty: property is the narrow {id,title,city,images} projection (same as BookingListItem), and the guest is exposed as `user`, not `guestInfo`.",
          allOf: [
            { $ref: "#/components/schemas/Booking" },
            {
              type: "object",
              properties: {
                property: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    city: { type: "string" },
                    images: { type: "array", items: { type: "string" } },
                  },
                  required: ["id", "title", "city", "images"],
                },
                user: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                  },
                  required: ["id", "firstName", "lastName"],
                },
              },
              required: ["property", "user"],
            },
          ],
        },
        BookingDetail: {
          allOf: [
            { $ref: "#/components/schemas/BookingWithProperty" },
            {
              type: "object",
              properties: {
                payment: {
                  allOf: [{ $ref: "#/components/schemas/Payment" }],
                  nullable: true,
                },
              },
              required: ["payment"],
            },
          ],
        },

        // --- Reviews ---
        Review: {
          type: "object",
          properties: {
            id: { type: "string" },
            bookingId: { type: "string" },
            userId: { type: "string" },
            propertyId: { type: "string" },
            rating: { type: "integer" },
            comment: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            hostReplyText: { type: "string", nullable: true },
            hostReplyById: { type: "string", nullable: true },
            hostReplyCreatedAt: { type: "string", format: "date-time", nullable: true },
            user: {
              type: "object",
              properties: {
                firstName: { type: "string" },
                lastName: { type: "string" },
              },
              required: ["firstName", "lastName"],
            },
            hostReplyBy: {
              type: "object",
              nullable: true,
              properties: {
                firstName: { type: "string" },
                lastName: { type: "string" },
              },
              required: ["firstName", "lastName"],
            },
          },
          required: [
            "id",
            "bookingId",
            "userId",
            "propertyId",
            "rating",
            "comment",
            "createdAt",
            "updatedAt",
            "hostReplyText",
            "hostReplyById",
            "hostReplyCreatedAt",
            "user",
            "hostReplyBy",
          ],
        },
        ReviewStats: {
          type: "object",
          properties: {
            averageRating: { type: "number", nullable: true },
            totalReviews: { type: "integer" },
            breakdown: {
              type: "object",
              properties: {
                "1": { type: "integer" },
                "2": { type: "integer" },
                "3": { type: "integer" },
                "4": { type: "integer" },
                "5": { type: "integer" },
              },
            },
            recentTrend: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  month: { type: "string" },
                  averageRating: { type: "number" },
                  totalReviews: { type: "integer" },
                },
                required: ["month", "averageRating", "totalReviews"],
              },
            },
          },
          required: ["averageRating", "totalReviews", "breakdown", "recentTrend"],
        },
        BlockedDates: {
          type: "object",
          properties: {
            bookedRanges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  checkIn: { type: "string", format: "date-time" },
                  checkOut: { type: "string", format: "date-time" },
                },
                required: ["checkIn", "checkOut"],
              },
            },
            blockedRanges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  startDate: { type: "string", format: "date-time" },
                  endDate: { type: "string", format: "date-time" },
                  reason: { type: "string", nullable: true },
                },
                required: ["startDate", "endDate", "reason"],
              },
            },
          },
          required: ["bookedRanges", "blockedRanges"],
        },
      },
      responses: {
        Unauthorized: {
          description: "Missing or invalid auth token",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Forbidden: {
          description: "Insufficient permissions",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotFound: {
          description: "Resource not found",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        ValidationError: {
          description: "Request validation failed",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Path to the API docs
  apis: [
    "./src/modules/**/*.routes.ts",
    "./src/api.routes.ts",
    "./dist/modules/**/*.routes.js",
    "./dist/api.routes.js",
  ],
};

/**
 * Kept separate from client.ts so server-side code (generateMetadata, RSC)
 * can read the API origin without pulling in the browser api client, whose
 * middleware touches the "use client" auth store on every request.
 */
export const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

// Behind a reverse proxy (Render, and most other hosts), the app receives
// each request on an internal address like http://localhost:10000, while the
// real public address is passed separately through the standard forwarded
// headers. Building a redirect from `new URL(request.url).origin` silently
// picks up that internal address instead, which is why links kept bouncing
// to localhost even once every Supabase setting was correct. Reading these
// headers first, and only falling back to the request URL for plain local
// development, gives the address a browser can actually reach.
export function getPublicOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

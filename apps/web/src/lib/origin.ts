export function isSameOrigin(request: Request, webOrigin: string): boolean {
  return request.headers.get("origin") === webOrigin;
}

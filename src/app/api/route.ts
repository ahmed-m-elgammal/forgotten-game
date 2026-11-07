import { NextResponse } from "next/server";

// static export (GitHub Pages) needs this route to be static;
// the game itself never calls it
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({ message: "Hello, world!" });
}
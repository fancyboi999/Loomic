import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-[#0E1014]">404</h1>
      <p className="text-[#A8A8A8]">Page not found</p>
      <Link
        href="/home"
        className="text-sm text-[#0E1014] underline underline-offset-4 hover:opacity-70"
      >
        Back to Home
      </Link>
    </div>
  );
}

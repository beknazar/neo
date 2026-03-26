import Link from "next/link";

export function NeoLogo({
  size = "lg",
  linked = true,
}: {
  size?: "sm" | "lg" | "xl";
  linked?: boolean;
}) {
  const sizeClass =
    size === "sm" ? "text-base" : size === "xl" ? "text-xl" : "text-lg";

  const mark = (
    <span className={`${sizeClass} font-semibold tracking-tight text-primary`}>
      neo
    </span>
  );

  if (!linked) return mark;

  return (
    <Link href="/" className="flex items-center gap-2">
      {mark}
    </Link>
  );
}

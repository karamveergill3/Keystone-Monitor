import { LOGO_SVG } from "@/lib/logo";

// The mark, inline so it stays sharp at any size. Decorative: the site's
// name always sits beside it in text.
export default function LogoMark({ className = "h-7 w-7" }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
    />
  );
}

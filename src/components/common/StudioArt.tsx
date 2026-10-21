import { useId } from "react";

/**
 * The matte plaster light-test head (DIRECTION.md, richness). A stand-in for the buyer's
 * own photo wherever none exists yet. Gradient ids are per instance (useId) so several
 * heads can share a page. `dimmed`: the light is off (waiting); `lit`: the key light is on,
 * with a firm cast shadow to the right (sent).
 */
export function PlasterHead({ className, dimmed = false, lit = false }: { className?: string; dimmed?: boolean; lit?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={className}
      viewBox="0 0 378 340"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
      style={dimmed ? { filter: "brightness(.48) saturate(.8)" } : undefined}
    >
      <defs>
        <radialGradient id={`h${id}`} cx=".36" cy=".3" r=".8">
          <stop offset="0" stopColor="#F2F3F0" />
          <stop offset=".5" stopColor="#D3D8D6" />
          <stop offset="1" stopColor="#9AA5A9" />
        </radialGradient>
        <radialGradient id={`t${id}`} cx=".3" cy=".26" r=".95">
          <stop offset="0" stopColor="#8E9AA0" stopOpacity="0" />
          <stop offset=".58" stopColor="#8E9AA0" stopOpacity="0" />
          <stop offset=".86" stopColor="#8E9AA0" stopOpacity=".75" />
          <stop offset="1" stopColor="#7E8A90" stopOpacity=".95" />
        </radialGradient>
        <linearGradient id={`n${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E4E7E4" />
          <stop offset=".55" stopColor="#BAC1C2" />
          <stop offset="1" stopColor="#848F94" />
        </linearGradient>
        <linearGradient id={`p${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9ECEA" />
          <stop offset=".16" stopColor="#C7CDCD" />
          <stop offset="1" stopColor="#919CA0" />
        </linearGradient>
        <radialGradient id={`c${id}`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#55656E" stopOpacity={lit ? ".78" : ".42"} />
          <stop offset="1" stopColor="#55656E" stopOpacity="0" />
        </radialGradient>
        <filter id={`f${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <ellipse cx="248" cy="196" rx="96" ry="132" fill={`url(#c${id})`} />
      <ellipse cx="189" cy="334" rx="120" ry="10" fill="#5B6B74" opacity=".3" />
      <rect x="129" y="282" width="120" height="52" rx="6" fill={`url(#p${id})`} />
      <ellipse cx="190" cy="284" rx="34" ry="6" fill="#6A777D" opacity=".55" filter={`url(#f${id})`} />
      <rect x="167" y="200" width="44" height="88" rx="19" fill={`url(#n${id})`} />
      <ellipse cx="192" cy="210" rx="26" ry="8" fill="#6A777D" opacity=".6" filter={`url(#f${id})`} />
      <g transform="rotate(-6 189 140)">
        <path d="M189 54C229 54 255 90 254 133C253 172 233 204 205 219C197 224 181 224 173 219C145 204 125 172 124 133C123 90 149 54 189 54Z" fill={`url(#h${id})`} />
        <path d="M189 54C229 54 255 90 254 133C253 172 233 204 205 219C197 224 181 224 173 219C145 204 125 172 124 133C123 90 149 54 189 54Z" fill={`url(#t${id})`} />
      </g>
    </svg>
  );
}

/** Profile hint for the optional side photos (facing left; mirror for the right side). */
export function ProfileHead({ className, mirrored = false }: { className?: string; mirrored?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 378 340" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`h${id}`} cx=".3" cy=".3" r=".85">
          <stop offset="0" stopColor="#F2F3F0" />
          <stop offset=".55" stopColor="#D0D6D5" />
          <stop offset="1" stopColor="#8D999F" />
        </radialGradient>
      </defs>
      <g transform={mirrored ? "translate(378,0) scale(-1,1)" : undefined}>
        <rect x="139" y="282" width="100" height="52" rx="6" fill="#C2C9CA" />
        <rect x="170" y="204" width="40" height="84" rx="18" fill="#B3BBBD" />
        <path d="M200 58C240 58 262 94 260 136C258 174 240 204 214 218C204 223 190 223 182 217L176 196C171 193 169 187 172 183L166 170C162 166 164 160 169 158L160 139C154 94 166 58 200 58Z" fill={`url(#h${id})`} />
      </g>
    </svg>
  );
}

export function CropMarks({ corners = ["tl", "tr", "bl", "br"] }: { corners?: ("tl" | "tr" | "bl" | "br")[] }) {
  return (
    <>
      {corners.map((corner) => (
        <i key={corner} className={`crop crop-${corner}`} aria-hidden="true" />
      ))}
    </>
  );
}

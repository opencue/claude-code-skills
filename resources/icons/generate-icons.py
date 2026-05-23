#!/usr/bin/env python3
"""
Generate brand icons for cue profiles from Simple Icons SVGs.

Usage:
    uv run --with Pillow --with cairosvg python3 generate-icons.py [icon_name...]

Without arguments, regenerates all icons. With arguments, only the named ones.

Icons are rendered at 64x64 RGBA PNG — the standard size for Kitty terminal
image protocol rendering in cue's TUI picker.

Sources:
    - Simple Icons (https://simpleicons.org) for brand SVGs
    - Custom SVG paths for brands not in Simple Icons
"""

import io
import os
import sys
import urllib.request

try:
    import cairosvg
    from PIL import Image
except ImportError:
    print("Missing deps. Run with: uv run --with Pillow --with cairosvg python3 generate-icons.py")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SIZE = 64

# Brand icon definitions: name -> {svg_slug, color, bg}
# svg_slug: name on simpleicons.org (lowercase, no spaces)
# color: fill color for the SVG path (hex without #)
# bg: background color (hex without #), or None for transparent
BRANDS = {
    "medusa": {
        "slug": "medusa",
        "color": "7C3AED",
        "bg": None,
    },
    "nvidia": {
        "slug": "nvidia",
        "color": "76B900",
        "bg": "000000",
        "output": "../../../profiles/nvidia/logo.png",
    },
    "docker": {
        "slug": "docker",
        "color": "FFFFFF",
        "bg": "2496ED",
    },
    "stripe": {
        "slug": "stripe",
        "color": "FFFFFF",
        "bg": "635BFF",
    },
    "github": {
        "slug": "github",
        "color": "FFFFFF",
        "bg": "181717",
    },
    "kubernetes": {
        "slug": "kubernetes",
        "color": "326CE5",
        "bg": None,
    },
    "python": {
        "slug": "python",
        "color": None,  # Python has a two-tone logo, use original colors
        "bg": None,
    },
    "rust": {
        "slug": "rust",
        "color": "000000",
        "bg": None,
    },
    "golang": {
        "slug": "go",
        "color": "00ADD8",
        "bg": None,
    },
    "nodejs": {
        "slug": "nodedotjs",
        "color": "5FA04E",
        "bg": None,
    },
    "aws": {
        "slug": "amazonwebservices",
        "color": "232F3E",
        "bg": None,
    },
    "azure": {
        "slug": "microsoftazure",
        "color": "0078D4",
        "bg": None,
    },
    "gcloud": {
        "slug": "googlecloud",
        "color": "4285F4",
        "bg": None,
    },
    "ansible": {
        "slug": "ansible",
        "color": "EE0000",
        "bg": None,
    },
    "hashicorp": {
        "slug": "hashicorp",
        "color": "000000",
        "bg": None,
    },
    "elastic": {
        "slug": "elastic",
        "color": "005571",
        "bg": None,
    },
    "splunk": {
        "slug": "splunk",
        "color": "000000",
        "bg": None,
    },
    "openai": {
        "slug": "openai",
        "color": "000000",
        "bg": None,
    },
    "obsidian": {
        "slug": "obsidian",
        "color": "7C3AED",
        "bg": None,
    },
    "coolify-brand": {
        "slug": "coolify",
        "color": "000000",
        "bg": None,
    },
    "owasp": {
        "slug": "owasp",
        "color": "000000",
        "bg": None,
    },
    "wireshark": {
        "slug": "wireshark",
        "color": "1679A7",
        "bg": None,
    },
}


def fetch_svg(slug: str) -> str | None:
    """Fetch SVG path data from Simple Icons CDN."""
    url = f"https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/{slug}.svg"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "cue-icon-gen/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read().decode()
    except Exception as e:
        print(f"  ⚠ Failed to fetch {slug}: {e}")
        return None


def render_icon(svg_content: str, color: str | None, bg: str | None) -> Image.Image:
    """Render SVG to 64x64 PNG with specified colors."""
    # Apply fill color to the path
    if color:
        # Replace any existing fill or add one
        if 'fill="' in svg_content:
            import re
            svg_content = re.sub(r'fill="[^"]*"', f'fill="#{color}"', svg_content)
        else:
            svg_content = svg_content.replace("<path ", f'<path fill="#{color}" ')

    # Add background rect if specified
    if bg:
        # Insert a background rect after the opening svg tag
        svg_content = svg_content.replace(
            'xmlns="http://www.w3.org/2000/svg">',
            f'xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" fill="#{bg}"/>',
        )

    png_data = cairosvg.svg2png(bytestring=svg_content.encode(), output_width=SIZE, output_height=SIZE)
    img = Image.open(io.BytesIO(png_data)).convert("RGBA")
    return img


def generate_icon(name: str, config: dict) -> bool:
    """Generate a single icon. Returns True on success."""
    print(f"  → {name}", end="")

    svg = fetch_svg(config["slug"])
    if not svg:
        return False

    img = render_icon(svg, config.get("color"), config.get("bg"))

    # Determine output path
    output = config.get("output")
    if output:
        out_path = os.path.join(SCRIPT_DIR, output)
    else:
        out_path = os.path.join(SCRIPT_DIR, f"{name}.png")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, "PNG")
    size = os.path.getsize(out_path)
    print(f" ✓ ({size} bytes)")
    return True


def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(BRANDS.keys())

    # Validate targets
    invalid = [t for t in targets if t not in BRANDS]
    if invalid:
        print(f"Unknown icons: {', '.join(invalid)}")
        print(f"Available: {', '.join(sorted(BRANDS.keys()))}")
        sys.exit(1)

    print(f"Generating {len(targets)} icon(s) at {SIZE}x{SIZE}...")
    success = 0
    for name in targets:
        if generate_icon(name, BRANDS[name]):
            success += 1

    print(f"\nDone: {success}/{len(targets)} icons generated.")


if __name__ == "__main__":
    main()

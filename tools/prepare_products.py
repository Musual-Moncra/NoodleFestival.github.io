#!/usr/bin/env python3
"""
tools/prepare_products.py
Processes real product reference photos from Reference/ into web-ready assets:
- assets/products/<id>.webp (cutout, tight-cropped, defringed, max dimension <= 1024px)
- assets/products/<id>-lid.webp (for cups/bowls: photo lid or generated foil lid, 512x512)
- assets/products/<id>-wrap.webp (for cups/bowls: opaque unrolled tile-friendly rectangular wrap, 1024xH)
- assets/products/products.json & js/products-data.js (window.MGF_PRODUCTS = [...])
- Generates contact sheet on mid-grey checkerboard at docs/shots/v4-cutouts.png
- Generates wrap contact sheet at docs/shots/v4-wraps.png
"""

import os
import glob
import json
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Map product IDs to clean Vietnamese display names (Brand · Flavor)
PRODUCT_NAMES = {
    'siukay-hai-san': 'Siukay · Hải sản',
    '3mien-gold-tom-chua-cay': '3 Miền Gold · Tôm chua cay',
    'buldak-cheese': 'Buldak · Phô mai',
    'cung-dinh-bo-ham': 'Cung Đình · Bò hầm',
    'cupnoodle-seafood': 'Cup Noodles · Hải sản',
    'gau-do-lau-thai-tom': 'Gấu Đỏ · Lẩu thái tôm',
    'kokomi-tom': 'Kokomi · Tôm chua cay',
    'koreno-bulgogi': 'Koreno · Bulgogi',
    'miliket-bo': 'Miliket · Bò',
    'modern-lau-thai-tom': 'Modern · Lẩu thái tôm',
    'omachi-bo-ham': 'Omachi · Bò hầm',
    'shin-super-spicy': 'Shin Ramyun · Siêu cay',
    'hao-hao-tom-chua-cay': 'Hảo Hảo · Tôm chua cay',
    'indomie-mi-goreng': 'Indomie · Mi Goreng',
    'mi-lau-thai-tom': 'Lẩu Thái · Tôm chua cay'
}

# Products with visible top lids suitable for photo extraction
# Others photographed straight-on use the generated foil lid
PHOTO_LID_IDS = {
    'cung-dinh-bo-ham',
    'modern-lau-thai-tom',
    'cupnoodle-seafood',
    '3mien-gold-tom-chua-cay',
    'siukay-hai-san'
}

def remove_background(im_rgb, thresh=242, sat_thresh=22):
    """
    Removes near-white background using 4-border flood fill.
    Preserves white elements inside the product packaging.
    Erodes alpha 1-2px and defringes edge pixels from inner neighbours to kill white halos.
    """
    arr = np.array(im_rgb)
    h, w, _ = arr.shape

    c_max = np.max(arr, axis=2)
    c_min = np.min(arr, axis=2)
    is_white = (arr[:, :, 0] >= thresh) & (arr[:, :, 1] >= thresh) & (arr[:, :, 2] >= thresh)
    is_neutral = (c_max - c_min) <= sat_thresh
    is_bg_candidate = is_white & is_neutral

    visited = np.zeros((h, w), dtype=bool)
    q = deque()

    # Seed from image borders where candidate background pixels touch
    for cy, cx in [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]:
        if is_bg_candidate[cy, cx] and not visited[cy, cx]:
            visited[cy, cx] = True
            q.append((cy, cx))

    for x in range(w):
        if is_bg_candidate[0, x] and not visited[0, x]:
            visited[0, x] = True
            q.append((0, x))
        if is_bg_candidate[h - 1, x] and not visited[h - 1, x]:
            visited[h - 1, x] = True
            q.append((h - 1, x))

    for y in range(h):
        if is_bg_candidate[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            q.append((y, 0))
        if is_bg_candidate[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        y, x = q.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                if not visited[ny, nx] and is_bg_candidate[ny, nx]:
                    visited[ny, nx] = True
                    q.append((ny, nx))

    fg_mask = (~visited).astype(np.uint8) * 255
    ys, xs = np.where(fg_mask > 0)
    if len(ys) == 0:
        return None, None, None

    # Erode alpha 1-2px using MinFilter to remove outer white fringe
    mask_img = Image.fromarray(fg_mask)
    eroded_mask_img = mask_img.filter(ImageFilter.MinFilter(3))
    eroded_mask = np.array(eroded_mask_img) > 0

    # Core mask (eroded 2-3px further) to identify clean inner colors
    core_mask_img = eroded_mask_img.filter(ImageFilter.MinFilter(5))
    core_mask = np.array(core_mask_img) > 0

    # Defringe RGB: initialize boundary pixels strictly from clean inner core
    clean_rgb = np.zeros_like(arr)
    clean_rgb[core_mask] = arr[core_mask]
    filled = core_mask.copy()

    for _ in range(6):
        need_fill = eroded_mask & (~filled)
        if not np.any(need_fill):
            break
        sum_rgb = np.zeros_like(clean_rgb, dtype=np.float32)
        count = np.zeros(filled.shape, dtype=np.float32)

        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                shifted_filled = np.roll(np.roll(filled, dy, axis=0), dx, axis=1)
                shifted_rgb = np.roll(np.roll(clean_rgb, dy, axis=0), dx, axis=1)

                if dy == -1: shifted_filled[-1, :] = False
                elif dy == 1: shifted_filled[0, :] = False
                if dx == -1: shifted_filled[:, -1] = False
                elif dx == 1: shifted_filled[:, 0] = False

                valid = shifted_filled & need_fill
                sum_rgb[valid] += shifted_rgb[valid]
                count[valid] += 1

        can_fill = count > 0
        clean_rgb[can_fill] = (sum_rgb[can_fill] / count[can_fill, None]).astype(np.uint8)
        filled = filled | can_fill

    unfilled = eroded_mask & (~filled)
    if np.any(unfilled):
        clean_rgb[unfilled] = arr[unfilled]

    # Soften edge 0.8px Gaussian blur
    final_alpha = eroded_mask_img.filter(ImageFilter.GaussianBlur(radius=0.8))

    rgba = Image.fromarray(clean_rgb)
    rgba.putalpha(final_alpha)

    # Tight crop to eroded bounds
    ys, xs = np.where(eroded_mask)
    if len(ys) == 0:
        ys, xs = np.where(fg_mask > 0)
    min_y, max_y = int(ys.min()), int(ys.max())
    min_x, max_x = int(xs.min()), int(xs.max())

    cropped = rgba.crop((min_x, min_y, max_x + 1, max_y + 1))
    fg_crop = eroded_mask[min_y:max_y + 1, min_x:max_x + 1]

    return cropped, fg_crop, (min_x, min_y, max_x, max_y)

def measure_body(fg_crop, p_type):
    """
    Measures normalized topW, bottomW, rimY for cup/bowl, or aspect for pack.
    """
    ch, cw = fg_crop.shape
    if p_type == 'pack':
        return {"aspect": round(float(ch / cw), 3)}

    rim_y_ratio = 0.12 if p_type == 'cup' else 0.14
    rim_row = int(ch * rim_y_ratio)

    top_row_xs = np.where(fg_crop[rim_row] > 0)[0]
    top_w_px = (top_row_xs.max() - top_row_xs.min() + 1) if len(top_row_xs) > 0 else cw
    top_w = float(top_w_px / cw)

    # Bottom width near the base (at 92% height)
    bot_row = int(ch * 0.92)
    bot_row_xs = np.where(fg_crop[bot_row] > 0)[0]
    bot_w_px = (bot_row_xs.max() - bot_row_xs.min() + 1) if len(bot_row_xs) > 0 else (cw * 0.7)
    bot_w = float(bot_w_px / cw)

    return {
        "topW": round(min(1.0, top_w), 2),
        "bottomW": round(bot_w, 2),
        "rimY": round(rim_y_ratio, 2)
    }

def extract_photo_lid(im_rgba, rimY=0.12):
    """
    Extracts the visible top lid ellipse from photos taken with an angled top,
    stretched into a 512x512 circular image with smooth boundary.
    """
    w, h = im_rgba.size
    lid_h = max(16, int(h * rimY * 1.35))
    top_crop = im_rgba.crop((0, 0, w, lid_h))

    stretched = top_crop.resize((512, 512), Image.Resampling.LANCZOS)

    mask = Image.new('L', (512, 512), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((2, 2, 509, 509), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1.0))

    stretched_alpha = np.array(stretched.split()[-1], dtype=np.float32) / 255.0
    circle_alpha = np.array(mask, dtype=np.float32) / 255.0
    final_alpha = (stretched_alpha * circle_alpha * 255).astype(np.uint8)

    stretched.putalpha(Image.fromarray(final_alpha))
    return stretched

def generate_foil_lid(main_hex, accent_hex, size=512):
    """
    Generates a realistic metallic foil disc lid:
    - Base in colors.main with radial metallic sheen/highlight
    - Thin colors.accent ring near outer rim
    - Small 'OPEN ▲' tab mark near edge
    - No fake logos
    """
    def hex_to_rgb(h):
        h = h.lstrip('#')
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

    main_rgb = hex_to_rgb(main_hex)
    accent_rgb = hex_to_rgb(accent_hex)

    center = size / 2.0
    radius = (size - 10) / 2.0

    y, x = np.ogrid[:size, :size]
    dist_center = np.sqrt((x - center)**2 + (y - center)**2)

    # Highlight center offset toward top-left
    hx, hy = size * 0.38, size * 0.35
    dist_hl = np.sqrt((x - hx)**2 + (y - hy)**2)

    mask = dist_center <= radius

    # Radial metallic highlight factor
    hl_factor = np.clip(
        1.0 + 0.35 * np.exp(-dist_hl**2 / (2 * (size * 0.28)**2)) - 0.15 * (dist_center / radius)**2,
        0.5,
        1.5
    )
    # Concentric foil micro-texture
    brushed = 1.0 + 0.03 * np.sin(dist_center * 0.5)
    factor = hl_factor * brushed

    arr = np.zeros((size, size, 4), dtype=np.uint8)
    for c in range(3):
        col_c = np.clip(main_rgb[c] * factor, 0, 255).astype(np.uint8)
        arr[:, :, c] = col_c
    arr[:, :, 3] = (mask * 255).astype(np.uint8)

    lid = Image.fromarray(arr, 'RGBA')
    draw = ImageDraw.Draw(lid)

    # Thin accent ring near edge (at 88% radius)
    r_accent = radius * 0.88
    draw.ellipse(
        (center - r_accent, center - r_accent, center + r_accent, center + r_accent),
        outline=accent_rgb + (220,),
        width=3
    )

    # Outer metallic rim ring
    r_outer = radius * 0.98
    draw.ellipse(
        (center - r_outer, center - r_outer, center + r_outer, center + r_outer),
        outline=(255, 255, 255, 130),
        width=2
    )

    # Small 'OPEN ▲' tab mark
    tab_y = int(center + radius * 0.72)
    draw.text((int(center - 24), tab_y), 'OPEN ▲', fill=accent_rgb + (230,))

    # Soft alpha edge mask
    circle_mask = Image.new('L', (size, size), 0)
    cm_draw = ImageDraw.Draw(circle_mask)
    cm_draw.ellipse((4, 4, size - 5, size - 5), fill=255)
    circle_mask = circle_mask.filter(ImageFilter.GaussianBlur(radius=0.9))

    cur_a = np.array(lid.split()[-1], dtype=np.float32) / 255.0
    cm_a = np.array(circle_mask, dtype=np.float32) / 255.0
    final_a = (cur_a * cm_a * 255).astype(np.uint8)
    lid.putalpha(Image.fromarray(final_a))

    return lid

def generate_unrolled_wrap(im_rgba, rimY=0.12, target_w=2048):
    """
    Creates an OPAQUE rectangular label unrolled from the full-res front photo (for cup and bowl).
    - Crops clean label strictly between rimY and 95% of cup height.
    - Drops thick filled top band to eliminate collar appearance in 3D.
    - Resizes clean label to fill full wrap height with at most a 2% rim lip at the very top
      (coloured from the label row directly beneath it, not the photo's rim) and at most a 2% lip
      at the bottom (coloured from the label row directly above it).
    - Left half = unrolled front, right half = straight copy (not mirrored).
    - Applies ~6% cross-fade at both seams (x = target_w/2 and wrap boundary x = 0/target_w)
      so the cylindrical wrap loops smoothly without hard visible seams.
    - Applies mild unsharp mask (radius 1, 60%) to ensure sharp 3D labels.
    - Zero alpha anywhere (opaque RGB).
    """
    arr = np.array(im_rgba)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    h, w, _ = arr.shape

    clean_start_y = int(h * rimY)
    clean_end_y = int(h * 0.95)

    half_w = target_w // 2

    # 1. Unroll clean label rows
    clean_rows = []
    for y in range(clean_start_y, clean_end_y):
        row_a = alpha[y]
        xs = np.where(row_a > 128)[0]
        if len(xs) > 10:
            left, right = xs[0], xs[-1]
            span = right - left + 1
            inset = max(1, int(span * 0.03))
            l, r = left + inset, right - inset
            if r > l:
                row_slice = rgb[y, l:r + 1]
                row_im = Image.fromarray(row_slice[None, :, :])
                resampled = row_im.resize((half_w, 1), Image.Resampling.LANCZOS)
                clean_rows.append(np.array(resampled)[0])
            else:
                clean_rows.append(np.zeros((half_w, 3), dtype=np.uint8))
        else:
            clean_rows.append(np.zeros((half_w, 3), dtype=np.uint8))

    unrolled_clean = np.array(clean_rows, dtype=np.float32)
    clean_h = unrolled_clean.shape[0]

    # Full wrap height H matches clean_h
    H_body = clean_h
    # Top rim lip: at most 2% of wrap height
    top_lip_h = max(2, int(round(H_body * 0.02)))
    # Bottom lip: at most 2% of wrap height
    bot_lip_h = max(2, int(round(H_body * 0.02)))
    # Clean label resized to fill remaining height
    label_h = H_body - top_lip_h - bot_lip_h

    # Resize clean label to label_h (slight vertical stretch fills wrap)
    clean_im = Image.fromarray(np.clip(unrolled_clean, 0, 255).astype(np.uint8))
    clean_resized = clean_im.resize((half_w, label_h), Image.Resampling.LANCZOS)
    clean_resized_arr = np.array(clean_resized, dtype=np.float32)

    # Top lip: coloured from the label row directly beneath it (not the photo's rim)
    top_lip = np.tile(clean_resized_arr[0:1, :, :], (top_lip_h, 1, 1))

    # Bottom lip: coloured from the label row directly above it
    bot_lip = np.tile(clean_resized_arr[-1:, :, :], (bot_lip_h, 1, 1))

    # Assemble unrolled front half
    unrolled = np.concatenate([top_lip, clean_resized_arr, bot_lip], axis=0)
    W = half_w

    # Right half is a STRAIGHT copy of the unrolled front (NOT mirrored to avoid backwards text)
    straight_copy = unrolled.copy()

    # 2x width wrap
    wrap = np.zeros((H_body, target_w, 3), dtype=np.float32)
    wrap[:, :W] = unrolled
    wrap[:, W:] = straight_copy

    # ~6% crossfade at seams
    bw = max(4, int(W * 0.06))

    # Seam 1 at x = W (front-right edge -> copy-left edge)
    seam1_slice = wrap[:, W - bw : W + bw].copy()
    seam1_blurred = np.array(Image.fromarray(seam1_slice.astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=bw * 0.4)))
    ramp1 = np.sin(np.linspace(0, np.pi, 2 * bw))[:, None]
    wrap[:, W - bw : W + bw] = (1.0 - ramp1) * seam1_slice + ramp1 * seam1_blurred

    # Seam 2 at wrap-around edges (copy-right edge -> front-left edge at u=0/1 wrap)
    tiled_edge = np.concatenate([wrap[:, -bw:], wrap[:, :bw]], axis=1)
    tiled_blurred = np.array(Image.fromarray(tiled_edge.astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=bw * 0.4)))
    ramp2 = np.sin(np.linspace(0, np.pi, 2 * bw))[:, None]
    blended_edge = (1.0 - ramp2) * tiled_edge + ramp2 * tiled_blurred
    wrap[:, -bw:] = blended_edge[:, :bw]
    wrap[:, :bw] = blended_edge[:, bw:]

    wrap_uint8 = np.clip(wrap, 0, 255).astype(np.uint8)
    wrap_im = Image.fromarray(wrap_uint8, 'RGB')

    # Mild unsharp mask (radius 1, 60%) to make text crisp
    wrap_sharp = wrap_im.filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))
    return wrap_sharp

def extract_colors(im_rgba):
    """
    Extracts 2 dominant non-white/non-black theme colors (main, accent).
    """
    arr = np.array(im_rgba)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]

    valid = alpha > 128
    pixels = rgb[valid]

    not_white = ~((pixels[:, 0] > 230) & (pixels[:, 1] > 230) & (pixels[:, 2] > 230))
    not_black = ~((pixels[:, 0] < 25) & (pixels[:, 1] < 25) & (pixels[:, 2] < 25))
    colored = pixels[not_white & not_black]

    if len(colored) < 100:
        colored = pixels

    if len(colored) > 10000:
        idx = np.random.choice(len(colored), 10000, replace=False)
        sample = colored[idx]
    else:
        sample = colored

    k = 5
    np.random.seed(42)
    centers = sample[np.random.choice(len(sample), k, replace=False)].astype(np.float32)

    for _ in range(12):
        dists = np.linalg.norm(sample[:, None, :] - centers[None, :, :], axis=2)
        labels = np.argmin(dists, axis=1)
        for i in range(k):
            members = sample[labels == i]
            if len(members) > 0:
                centers[i] = members.mean(axis=0)

    counts = np.bincount(labels, minlength=k)
    order = np.argsort(-counts)

    main_c = centers[order[0]].astype(int)
    accent_c = main_c

    for idx in order[1:]:
        c = centers[idx].astype(int)
        if np.linalg.norm(c - main_c) > 60:
            accent_c = c
            break

    def to_hex(c):
        return f"#{c[0]:02X}{c[1]:02X}{c[2]:02X}"

    return to_hex(main_c), to_hex(accent_c)

def make_mid_grey_checkerboard(width, height, tile_size=16, c1=(140, 140, 145), c2=(115, 115, 120)):
    """
    Creates a mid-grey checkerboard background pattern for visual inspection of dark and light fringes.
    """
    bg = Image.new('RGB', (width, height), c1)
    draw = ImageDraw.Draw(bg)
    for y in range(0, height, tile_size):
        for x in range(0, width, tile_size):
            if ((x // tile_size) + (y // tile_size)) % 2 == 1:
                draw.rectangle((x, y, x + tile_size - 1, y + tile_size - 1), fill=c2)
    return bg

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ref_dir = os.path.join(base_dir, 'Reference')
    assets_dir = os.path.join(base_dir, 'assets', 'products')
    js_dir = os.path.join(base_dir, 'js')
    shots_dir = os.path.join(base_dir, 'docs', 'shots')

    os.makedirs(assets_dir, exist_ok=True)
    os.makedirs(shots_dir, exist_ok=True)

    ref_files = sorted(glob.glob(os.path.join(ref_dir, '*.jpg')))
    if not ref_files:
        print(f"No reference files found in {ref_dir}!")
        return

    print(f"Processing {len(ref_files)} reference files with wraps, defringing, and lid inspection...")

    products = []
    contact_items = []
    wrap_items = []

    for fpath in ref_files:
        base = os.path.basename(fpath)
        name_no_ext, _ = os.path.splitext(base)
        parts = name_no_ext.split('--', 1)
        if len(parts) != 2:
            continue

        p_type, p_id = parts[0], parts[1]
        im = Image.open(fpath).convert('RGB')

        cropped_rgba, fg_crop, bbox = remove_background(im)
        if cropped_rgba is None:
            print(f"Failed to segment {base}")
            continue

        # Keep unrolled wrap source at full resolution before downscaling front
        unrolled_source_rgba = cropped_rgba

        # Constrain max dimension: packs to long side 1536, cups/bowls to 1024
        cw, ch = cropped_rgba.size
        max_dim = max(cw, ch)
        target_max_dim = 1536 if p_type == 'pack' else 1024
        if max_dim > target_max_dim:
            scale = float(target_max_dim) / max_dim
            new_w = int(round(cw * scale))
            new_h = int(round(ch * scale))
            cropped_rgba = cropped_rgba.resize((new_w, new_h), Image.Resampling.LANCZOS)
            cw, ch = new_w, new_h

        # Save front webp
        front_rel = f"assets/products/{p_id}.webp"
        front_path = os.path.join(base_dir, front_rel)
        cropped_rgba.save(front_path, 'WEBP', quality=92, method=6)

        body_info = measure_body(fg_crop, p_type)
        main_col, accent_col = extract_colors(cropped_rgba)
        disp_name = PRODUCT_NAMES.get(p_id, p_id.replace('-', ' ').title())

        entry = {
            "id": p_id,
            "name": disp_name,
            "type": p_type,
            "front": front_rel,
            "w": cw,
            "h": ch,
            "colors": {
                "main": main_col,
                "accent": accent_col
            }
        }

        lid_img = None
        lid_source = None
        wrap_img = None

        if p_type in ('cup', 'bowl'):
            rimY = body_info.get("rimY", 0.12)

            # Lid
            lid_rel = f"assets/products/{p_id}-lid.webp"
            lid_path = os.path.join(base_dir, lid_rel)
            if p_id in PHOTO_LID_IDS:
                lid_img = extract_photo_lid(cropped_rgba, rimY=rimY)
                lid_source = "photo"
            else:
                lid_img = generate_foil_lid(main_col, accent_col, size=512)
                lid_source = "generated"

            lid_img.save(lid_path, 'WEBP', quality=92, method=6)
            entry["lid"] = lid_rel
            entry["lidSource"] = lid_source

            # Wrap: unroll from full-res reference photo cutout, target_w = 2048
            wrap_rel = f"assets/products/{p_id}-wrap.webp"
            wrap_path = os.path.join(base_dir, wrap_rel)
            wrap_img = generate_unrolled_wrap(unrolled_source_rgba, rimY=rimY, target_w=2048)
            wrap_img.save(wrap_path, 'WEBP', quality=92, method=6)
            entry["wrap"] = wrap_rel

            entry["body"] = body_info
            wrap_items.append((p_id, p_type, wrap_img))
        else:
            entry["body"] = body_info

        products.append(entry)
        contact_items.append((p_id, p_type, cropped_rgba, lid_img, lid_source, wrap_img))
        print(f"  ✓ {p_id} ({p_type}): {cw}x{ch}, lid: {lid_source or 'none'}, wrap: {'yes' if wrap_img else 'no'}")

    # Write assets/products/products.json
    json_path = os.path.join(assets_dir, 'products.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    print(f"Saved {json_path}")

    # Write js/products-data.js
    js_data_path = os.path.join(js_dir, 'products-data.js')
    with open(js_data_path, 'w', encoding='utf-8') as f:
        f.write("/* Auto-generated by tools/prepare_products.py — do not edit manually */\n")
        f.write("window.MGF_PRODUCTS = ")
        json.dump(products, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    print(f"Saved {js_data_path}")

    # Generate main contact sheet docs/shots/v4-cutouts.png
    cols = 5
    rows = (len(contact_items) + cols - 1) // cols
    cell_w, cell_h = 320, 360
    total_w = cols * cell_w
    total_h = rows * cell_h

    sheet = make_mid_grey_checkerboard(total_w, total_h, tile_size=16)
    sheet_draw = ImageDraw.Draw(sheet)

    for i, (pid, ptype, front_img, lid_img, lsource, wimg) in enumerate(contact_items):
        col = i % cols
        row = i // cols
        cx = col * cell_w
        cy = row * cell_h

        # Fit front image into 190x250 box
        front_thumb = front_img.copy()
        front_thumb.thumbnail((190, 250), Image.Resampling.LANCZOS)
        tw, th = front_thumb.size
        px = cx + 15 + (190 - tw) // 2
        py = cy + 50 + (250 - th) // 2
        sheet.paste(front_thumb, (px, py), front_thumb)

        # If lid exists, thumbnail to 70x70 and paste top right
        if lid_img:
            lid_thumb = lid_img.copy()
            lid_thumb.thumbnail((70, 70), Image.Resampling.LANCZOS)
            lw, lh = lid_thumb.size
            sheet.paste(lid_thumb, (cx + 225 + (70 - lw) // 2, cy + 50), lid_thumb)
            sheet_draw.text((cx + 220, cy + 125), f"Lid ({lsource})", fill=(20, 20, 25))

        # If wrap exists, show miniature thumbnail below lid
        if wimg:
            wrap_thumb = wimg.copy()
            wrap_thumb.thumbnail((80, 50), Image.Resampling.LANCZOS)
            ww, wh = wrap_thumb.size
            sheet.paste(wrap_thumb, (cx + 225 + (80 - ww) // 2, cy + 155))
            sheet_draw.text((cx + 230, cy + 210), "Wrap", fill=(20, 20, 25))

        # Text label
        label = f"{pid}\n[{ptype}]"
        sheet_draw.text((cx + 20, cy + 15), label, fill=(20, 20, 25))

    contact_path = os.path.join(shots_dir, 'v4-cutouts.png')
    sheet.save(contact_path, 'PNG')
    print(f"Saved contact sheet to {contact_path}")

    # Generate dedicated wrap contact sheets (v6c-wraps.png: 2 per row, readable size)
    if wrap_items:
        # v6c-wraps.png: 2 per row at large readable size
        c_cols = 2
        c_rows = (len(wrap_items) + c_cols - 1) // c_cols
        c_cell_w, c_cell_h = 960, 340
        c_total_w = c_cols * c_cell_w
        c_total_h = c_rows * c_cell_h

        c_sheet = make_mid_grey_checkerboard(c_total_w, c_total_h, tile_size=16)
        c_sheet_draw = ImageDraw.Draw(c_sheet)

        for i, (pid, ptype, wimg) in enumerate(wrap_items):
            col = i % c_cols
            row = i // c_cols
            cx = col * c_cell_w
            cy = row * c_cell_h

            # Scale wrap to fit 900x260
            wt = wimg.copy()
            wt.thumbnail((900, 260), Image.Resampling.LANCZOS)
            ww, wh = wt.size
            c_sheet.paste(wt, (cx + 30 + (900 - ww) // 2, cy + 45))

            c_sheet_draw.text((cx + 30, cy + 18), f"{pid} [{ptype}] — wrap {wimg.size[0]}x{wimg.size[1]} (label resized to full height, <=2% lip)", fill=(20, 20, 25))

        v6c_wraps_path = os.path.join(shots_dir, 'v6c-wraps.png')
        c_sheet.save(v6c_wraps_path, 'PNG')
        print(f"Saved readable 2-per-row wraps sheet to {v6c_wraps_path}")

        # Also update v6-wraps.png and v4-wraps.png
        v6_wraps_path = os.path.join(shots_dir, 'v6-wraps.png')
        c_sheet.save(v6_wraps_path, 'PNG')
        wraps_contact_path = os.path.join(shots_dir, 'v4-wraps.png')
        c_sheet.save(wraps_contact_path, 'PNG')

if __name__ == '__main__':
    main()

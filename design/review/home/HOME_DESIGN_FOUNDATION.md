# DURI Home Design Foundation

This document records values actually implemented in the final Home. It is a reference for later redesign work, not a global-theme migration.

## Color

- Primary: `#4388FF`
- Primary soft: `#DDEBFF`
- Hero surface: `#F2F8FF`
- DURI surface: `#F3F1FF`
- Planning lavender: `#F0EDFF`
- Planning peach: `#FFF0E2`
- Success mint: `#EAF7EE`
- Main text: `#17265F`
- Secondary text: `#60719B`
- Muted text: `#8290AE`
- White surface: `#FFFFFF`
- Soft border: `#DCE7F7`

White is the page base. Pastels are bounded to Hero, DURI, badges, metric cells, and small decorative surfaces.

## Spacing

- Page horizontal padding: `20px`
- Header height: `62px`
- Section-to-section gap: generally `24–28px`
- Card gap: `12px`
- Card internal padding: `14–18px`
- Compact place-row gap: `11px`
- Scroll content bottom padding: `112px`

## Radius

- Hero: `22px`
- Trip card: `20px`
- DURI card: `22px`
- Place list: `18px`
- Trip CTA: `13px`
- DURI CTA: `12px`
- Badge: pill radius

## Typography

- Hero heading: `23/31`, weight 900; `21/29` at 360px
- Section heading: `19/25`, weight 800
- Trip title: `18/24`, weight 800
- DURI title: `19/26`, weight 900
- Place title: `15/20`, weight 800
- Body: `12–13px`, line height `18–19px`
- Caption/tag: `9–12px`, weight 600–700
- Button: `13–15px`, weight 800

Use deep navy for headings and blue-gray for supporting copy. Keep long mobile headings to two lines when possible.

## Shadow and Border

- Cards use the existing `shadows.card` token.
- Primary card border: `1px #DCE7F7`.
- DURI border: `1px #D9D5FF`.
- Hero border: `1px #CFE4FF`.
- The create-trip card uses a `1.5px` dashed `#9FB7E5` border.

## Badge Rules

- Badges are compact pills with real state labels.
- Planning: lavender.
- Drafting: peach.
- Confirmed: mint.
- Completed: neutral gray.
- Never invent a status or count for visual balance.

## Button Rules

- Primary trip CTA: solid primary blue, white label, right arrow.
- DURI CTA: white translucent surface, primary outline/label, right arrow.
- Minimum tap target is 42–46px in Home; profile uses a 44px target.
- CTA routes must reuse existing flows and gates.

## Character Illustration Rules

- Use official transparent PNGs only; never crop characters from a screenshot.
- Default to `contain`.
- Preserve full faces, bodies, luggage, maps, and planning props.
- Hero characters occupy about 49–51% of the Hero width.
- DURI planning art occupies about 46% of the DURI card width.
- Character art is decorative for screen readers and should not repeat on ordinary place rows.

## Trip Card Rules

- Responsive card width: `viewport width - 96px`, minimum `252px`.
- Carousel gap: `12px`.
- Keep part of the next card visible; the final create card is `84–96px` wide so `+` and `새 여행` remain recognizable.
- Order: state badge, title, date/members, landscape image, actual metrics, CTA.
- Metric tones: lavender for candidates, blue for itinerary, mint for preference responses.
- Use actual trip/region/store data only.

## Place Card Rules

- Home uses compact rows rather than Explore-sized cards.
- Row minimum height: `78px`.
- Thumbnail width: `86px`, landscape ratio `1.36`.
- Order: thumbnail, category/tag, name, region/address, save heart.
- Saved state uses the existing saved-place mutation and accessibility selected state.
- Use `추천 장소` unless a real popularity ordering exists.

## Bottom Navigation Rules

- Keep the existing five tabs and `64px` tab-bar token.
- Do not restyle other tab screens from a Home-only change.
- Home content must keep at least `112px` bottom padding so the final interactive row clears the tab bar and safe area.

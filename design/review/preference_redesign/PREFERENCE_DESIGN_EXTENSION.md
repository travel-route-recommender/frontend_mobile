# DURI Preference Design Extension

This document adds Preference-specific rules to the existing DURI design foundations. It does not replace the Home, My Page, Create Trip, Trip Home, Workspace, or shared typography foundations.

## Preference Family

- Detailed Intro, Question, and Result use one family: white page, deep navy content hierarchy, primary blue action/progress, lavender preference context, mint positive traits, muted blue-gray support text.
- Use the shared horizontal page gutter, soft border, rounded card, restrained shadow, and safe-area behavior already established elsewhere in DURI.
- Do not apply this shell to the separate onboarding Quick Test.

## Preference Header

- User-facing title is `여행 성향 알아보기` for Intro, Question, and Result.
- Only connect back/exit controls that have a real route or modal behavior.
- Keep the header visually quiet so question/result identity stays dominant.

## Preference Intro

- Intro is a presentation state inside the existing detailed test entry route, not a progress chapter.
- Information order: purpose → actual scale → draft saving → result use → optional official illustration → primary start action.
- Derive chapter/question counts from the current test definition. Do not display an unmeasured time estimate.
- Skip Intro for an answered in-progress draft so resume remains direct.

## Chapter Progress

- Always show `챕터 N / TOTAL_CHAPTERS` from the canonical progress resolver.
- Use a short semantic chapter label from test configuration, not the full question title and not a display-only duplicate chapter model.
- Use primary blue for the filled track on a restrained light-blue/lavender surface.

## Inner Progress

- Pair chapter progress with the actual atomic unit: question, scale criterion, ranking position, or selection step.
- Examples are generated from data: `질문 3 / 15`, `예산 순위 2 / 5`, `관심 장면 선택 1 / 2`.
- Never imply completion from the chapter numerator alone.

## Question Shell

- Structure: header → progress → scrollable question content → sticky previous/next footer.
- The screen owns navigation, validation, and atomic transitions. Question variants own only their answer UI.
- The atomic question key owns scroll reset. Pure answer mutations inside the same key must not reset scroll.
- Footer buttons use the established DURI fixed action sizing and safe-area padding.

## Question Typography

- The actual question is the largest deep-navy text in the content region.
- Supporting copy uses muted blue-gray and must not compete with the question.
- Apply Korean word-preserving wrapping so short final syllables do not fall onto their own line when reasonable width is available.

## Single Option

- Default: white surface, soft border, deep-navy title, muted description.
- Selected: primary-blue border, very light blue fill, explicit selected indicator.
- Preserve radio semantics and existing validation.

## Compound Question

- Keep the chapter prompt outside the repeated cards.
- Each compound criterion uses one bounded card with context, A/B anchors, and its native control.
- Do not repeat internal navigation inside compound content; the shared sticky footer advances only after all required answers are complete.

## Scale Question

- Keep the native ordered scale and both semantic endpoints.
- All values must remain discoverable at 360px; use equal flexible cells rather than converting scale values to a vertical option list.
- Selected state uses the same primary-blue semantic as other preference answers.

## Ranking Question

- Reveal one rank at a time and remove already selected items through the existing ranking model.
- Show current rank in inner progress and near the prompt.
- Rank item cards remain compact rows; selecting a row is an atomic transition and resets the next rank to the top.

## Multi-select Question

- Preserve multiple-selection semantics and minimum/maximum requirements.
- Do not use a single-select radio visual. Use the existing explicit selected treatment and validation message.
- Internal selection-step progress comes from the canonical resolver.

## Preference Result Hero

- Canonical `profileType` is the strongest element, followed by summary and actual preferred tags.
- Use at most one small official DURI asset in the hero; it must remain subordinate and fully visible.
- Compact long tag sets using the existing Top N + `+N` pattern rather than wrapping an unbounded list.

## Trait Presentation

- Trait layout responds to actual text length. Prefer vertical rows for Korean phrases that would become cramped in columns.
- Mint is reserved for positive trait markers; trait text remains deep navy on white.

## Dimension Presentation

- Display dimensions or scores only when they exist in the matching detailed result.
- Preserve the domain's real range and meaning. Never synthesize 0–100 bars from the visual reference.
- Keep detailed data behind progressive disclosure when the result would otherwise become excessively long.

## Result Pair and Fallback

- Hero and detail must resolve from the same completed result pair.
- Never attach a historical detail record to a newer canonical result.
- When no matching detail exists, show one explicit safe fallback state; retain the canonical summary without fabricated details.

## Preference Result Actions

- Member primary: action that uses the result (`친구와 궁합 보기`) when the route is available.
- Secondary: return to the product (`홈으로 이동`).
- Tertiary: maintenance/retry (`테스트 다시 하기`).
- Keep guest and anonymous actions aligned with existing permissions.

## Character Use

- Use only repository-owned official DURI assets.
- Intro may use one larger DURI/Dusun illustration after essential information.
- Question screens use only a small avatar or guide icon; never repeat a large character on every question.
- Result may use one smaller full character within the hero. Do not crop a character from a reference image.

## Responsive Acceptance

- Required verification widths: 360, 390, and 430; reference viewport height: 844.
- Confirm long Korean question/option wrapping, all scale values, ranking rows, result hero/traits, sticky footer, and zero horizontal overflow.
- Keep a 390px final capture for Intro, representative Question, and Result. Keep separate variant captures when scale/ranking structure differs materially.

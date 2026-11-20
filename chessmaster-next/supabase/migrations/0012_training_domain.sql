-- R4: record the authoritative content DOMAIN on each training event so adaptive skill
-- aggregation uses the puzzle's verified primary domain (e.g. a promotion-in-endgame puzzle
-- counts toward `endgame`, not whatever its theme regex would imply). Nullable + backfill-free:
-- legacy rows keep NULL and the aggregator falls back to the theme->domain mapping for those.
alter table if exists training_events add column if not exists domain text;

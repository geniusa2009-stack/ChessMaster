-- Seed the base achievement catalog (award logic lives in the Next.js server layer).
insert into public.achievements (key, title, description) values
  ('first_win',    'First Victory',      'Win your first game.'),
  ('blunder_free', 'Clean Sheet',        'Finish a game with zero blunders.'),
  ('giant_slayer', 'Giant Slayer',       'Defeat a bot rated 2000+.'),
  ('ranked_10',    'Contender',          'Play 10 ranked games.')
on conflict (key) do nothing;

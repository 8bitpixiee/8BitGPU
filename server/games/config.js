// every arcade game the server knows about. leaderboard: how scores sort. max: seats in a relay room (0 = no rooms)
export const GAMES = {
  brawl: { title: "Pixie Brawl", leaderboard: "high", max: 0 },
  kart: { title: "Pixie Kart", leaderboard: "low", max: 8 }, // score is a lap time in ms
  survivors: { title: "Pixie Survivors", leaderboard: "high", max: 0 },
  party: { title: "Pixel Party", leaderboard: "high", max: 8 },
  dungeon: { title: "Dungeon Crawl", leaderboard: "high", max: 4 },
  cone: { title: "Cone Game", leaderboard: "high", max: 0 },
  studio: { title: "Artists Room", leaderboard: null, max: 8 }, // collab drawing rooms, no scores
};
export const SCORE_MAX = 1e9;

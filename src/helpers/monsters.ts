import srdMonsterNames from "../5e/data/srdMonsterNames";

const monsters = Array.from(srdMonsterNames);

export default monsters;

export function getRandomMonster(): string {
  return monsters[Math.floor(Math.random() * monsters.length)];
}

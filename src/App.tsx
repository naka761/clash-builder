import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

// === Types ===
type BuildingType = "base" | "cannon" | "archer" | "wizard" | "mortar" | "wall";
type UnitType = "warrior" | "heavy" | "archerUnit" | "giant" | "wizardUnit";
type Phase = "defense" | "attack" | "battle" | "result";

interface BuildingDef {
  emoji: string;
  hp: number;
  name: string;
  cost: number;
  range?: number;
  damage?: number;
  fireRate?: number;
  splash?: number;
  minRange?: number;
  desc: string;
}

interface UnitDef {
  emoji: string;
  hp: number;
  damage: number;
  speed: number;
  name: string;
  attackRate: number;
  cost: number;
  range: number;
  desc: string;
  targetPriority?: "defense";
  splash?: number;
}

interface Building {
  id: number;
  type: BuildingType;
  r: number;
  c: number;
  hp: number;
  maxHp: number;
  fireCooldown: number;
}

interface Unit {
  id: number;
  type: UnitType;
  r: number;
  c: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackRate: number;
  attackCooldown: number;
  moveCooldown: number;
  range: number;
  splash: number;
  targetPriority?: "defense";
}

interface Projectile {
  id: number;
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  ttl: number;
  maxTtl: number;
  emoji: string;
}

interface Effect {
  id: number;
  r: number;
  c: number;
  text: string;
  ttl: number;
  color: string;
}

interface GameState {
  phase: Phase;
  buildings: Building[];
  units: Unit[];
  projectiles: Projectile[];
  effects: Effect[];
  destruction: number;
  tick: number;
  gold: number;
  elixir: number;
  battleSpeed: number;
}

// === Constants ===
const GRID_SIZE = 14;
const CELL_SIZE = 44;
const BASE_TICK_MS = 220;
const DEFENSE_GOLD = 1500;
const ATTACK_ELIXIR = 800;

const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  base:   { emoji: "🏰", hp: 500, name: "本拠地",       cost: 0,   desc: "防衛の要" },
  cannon: { emoji: "💣", hp: 200, name: "砲台",         cost: 100, range: 3,   damage: 18, fireRate: 3, desc: "中距離の安定火力" },
  archer: { emoji: "🏹", hp: 150, name: "アーチャー塔", cost: 120, range: 4.5, damage: 10, fireRate: 2, desc: "長距離・連射型" },
  wizard: { emoji: "🔮", hp: 180, name: "ウィザード塔", cost: 200, range: 3.5, damage: 22, fireRate: 4, splash: 1.5, desc: "範囲攻撃" },
  mortar: { emoji: "🎯", hp: 250, name: "迫撃砲",       cost: 250, range: 6,   damage: 30, fireRate: 5, splash: 1.5, minRange: 2.5, desc: "超長距離・範囲（近距離死角）" },
  wall:   { emoji: "🧱", hp: 350, name: "壁",           cost: 25,  desc: "安価・進路妨害" },
};

const UNIT_DEFS: Record<UnitType, UnitDef> = {
  warrior:    { emoji: "⚔️",  hp: 130, damage: 22, speed: 1,   name: "戦士",         attackRate: 2, cost: 50,  range: 1.5, desc: "バランス型近接" },
  heavy:      { emoji: "🛡️", hp: 350, damage: 40, speed: 0.5, name: "重装戦士",     attackRate: 3, cost: 100, range: 1.5, desc: "高HP壁役" },
  archerUnit: { emoji: "🎯",  hp: 60,  damage: 12, speed: 1,   name: "アーチャー",   attackRate: 1, cost: 60,  range: 3.5, desc: "遠距離・低HP" },
  giant:      { emoji: "👹",  hp: 500, damage: 25, speed: 0.3, name: "ジャイアント", attackRate: 3, cost: 150, range: 1.5, desc: "超HP・防衛施設優先", targetPriority: "defense" },
  wizardUnit: { emoji: "🧙",  hp: 70,  damage: 30, speed: 0.8, name: "ウィザード",   attackRate: 3, cost: 120, range: 3,   desc: "遠距離範囲攻撃", splash: 1.5 },
};

// === Helpers ===
function dist(r1: number, c1: number, r2: number, c2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (c1 - c2) ** 2);
}

function getNeighbors(r: number, c: number): [number, number][] {
  const dirs: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const result: [number, number][] = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
      result.push([nr, nc]);
    }
  }
  return result;
}

function findPath(sr: number, sc: number, tr: number, tc: number, obstacles: Set<string>): [number, number][] {
  const key = (r: number, c: number) => `${r},${c}`;
  const open: [number, number, number][] = [[sr, sc, 0]];
  const visited = new Set<string>();
  visited.add(key(sr, sc));
  const parent: Record<string, string | undefined> = {};

  while (open.length > 0) {
    open.sort((a, b) => (a[2] + dist(a[0], a[1], tr, tc)) - (b[2] + dist(b[0], b[1], tr, tc)));
    const item = open.shift()!;
    const [r, c, g] = item;

    if (r === tr && c === tc) {
      const path: [number, number][] = [];
      let cur: string | undefined = key(tr, tc);
      while (cur && cur !== key(sr, sc)) {
        const [pr, pc] = cur.split(",").map(Number);
        path.unshift([pr, pc]);
        cur = parent[cur];
      }
      return path;
    }

    for (const [nr, nc] of getNeighbors(r, c)) {
      const k = key(nr, nc);
      if (!visited.has(k) && !obstacles.has(k)) {
        visited.add(k);
        parent[k] = key(r, c);
        open.push([nr, nc, g + 1]);
      }
    }
  }

  // Fallback: direct path
  const directPath: [number, number][] = [];
  let cr = sr, cc = sc;
  for (let i = 0; i < 50; i++) {
    const dr = Math.sign(tr - cr), dc = Math.sign(tc - cc);
    if (dr !== 0) cr += dr;
    else if (dc !== 0) cc += dc;
    directPath.push([cr, cc]);
    if (cr === tr && cc === tc) break;
  }
  return directPath;
}

// === Component ===
export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    phase: "defense",
    buildings: [],
    units: [],
    projectiles: [],
    effects: [],
    destruction: 0,
    tick: 0,
    gold: DEFENSE_GOLD,
    elixir: ATTACK_ELIXIR,
    battleSpeed: 1,
  });

  const [selectedBuilding, setSelectedBuilding] = useState<BuildingType>("cannon");
  const [selectedUnit, setSelectedUnit] = useState<UnitType>("warrior");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalHpRef = useRef(0);

  const initDefense = useCallback(() => {
    const baseBuilding: Building = {
      id: 0,
      type: "base",
      r: Math.floor(GRID_SIZE / 2),
      c: Math.floor(GRID_SIZE / 2),
      hp: BUILDING_DEFS.base.hp,
      maxHp: BUILDING_DEFS.base.hp,
      fireCooldown: 0,
    };
    setGameState({
      phase: "defense",
      buildings: [baseBuilding],
      units: [],
      projectiles: [],
      effects: [],
      destruction: 0,
      tick: 0,
      gold: DEFENSE_GOLD,
      elixir: ATTACK_ELIXIR,
      battleSpeed: 1,
    });
    totalHpRef.current = 0;
  }, []);

  useEffect(() => { initDefense(); }, [initDefense]);

  const isEdgeArea = (r: number, c: number) =>
    r <= 1 || r >= GRID_SIZE - 2 || c <= 1 || c >= GRID_SIZE - 2;

  const handleCellClick = (r: number, c: number) => {
    setGameState(prev => {
      if (prev.phase === "defense") {
        const exists = prev.buildings.find(b => b.r === r && b.c === c);
        if (exists) {
          if (exists.type === "base") return prev;
          return {
            ...prev,
            buildings: prev.buildings.filter(b => b.id !== exists.id),
            gold: prev.gold + BUILDING_DEFS[exists.type].cost,
          };
        }
        if (selectedBuilding === "base") return prev;
        const def = BUILDING_DEFS[selectedBuilding];
        if (def.cost > prev.gold) return prev;
        return {
          ...prev,
          buildings: [...prev.buildings, {
            id: Date.now() + Math.random(),
            type: selectedBuilding,
            r, c,
            hp: def.hp,
            maxHp: def.hp,
            fireCooldown: 0,
          }],
          gold: prev.gold - def.cost,
        };
      } else if (prev.phase === "attack") {
        if (!isEdgeArea(r, c)) return prev;
        if (prev.buildings.some(b => b.r === r && b.c === c)) return prev;
        const exists = prev.units.find(u => u.r === r && u.c === c);
        if (exists) {
          return {
            ...prev,
            units: prev.units.filter(u => u.id !== exists.id),
            elixir: prev.elixir + UNIT_DEFS[exists.type].cost,
          };
        }
        const def = UNIT_DEFS[selectedUnit];
        if (def.cost > prev.elixir) return prev;
        return {
          ...prev,
          units: [...prev.units, {
            id: Date.now() + Math.random(),
            type: selectedUnit,
            r, c,
            hp: def.hp,
            maxHp: def.hp,
            damage: def.damage,
            speed: def.speed,
            attackRate: def.attackRate,
            attackCooldown: 0,
            moveCooldown: 0,
            range: def.range,
            splash: def.splash ?? 0,
            targetPriority: def.targetPriority,
          }],
          elixir: prev.elixir - def.cost,
        };
      }
      return prev;
    });
  };

  const startBattle = () => {
    setGameState(prev => {
      const total = prev.buildings.reduce((s, b) => s + b.maxHp, 0);
      totalHpRef.current = total;
      return { ...prev, phase: "battle", tick: 0 };
    });
  };

  // === Battle Loop ===
  useEffect(() => {
    if (gameState.phase !== "battle") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const tickMs = Math.round(BASE_TICK_MS / gameState.battleSpeed);

    timerRef.current = setInterval(() => {
      setGameState(prev => {
        if (prev.phase !== "battle") return prev;

        const newBuildings = prev.buildings.map(b => ({ ...b }));
        let newUnits = prev.units.map(u => ({ ...u }));
        let newProj = [...prev.projectiles];
        let newEffects = prev.effects.filter(e => e.ttl > 0).map(e => ({ ...e, ttl: e.ttl - 1 }));

        const aliveBuildings = newBuildings.filter(b => b.hp > 0);
        const wallPositions = new Set(
          aliveBuildings.filter(b => b.type === "wall").map(b => `${b.r},${b.c}`)
        );

        // --- Unit AI ---
        for (const u of newUnits) {
          if (u.hp <= 0) continue;

          // Find target
          let nearest: Building | null = null;
          let nearDist = Infinity;

          if (u.targetPriority === "defense") {
            const defenseBuildings = aliveBuildings.filter(
              b => b.type === "cannon" || b.type === "archer" || b.type === "wizard" || b.type === "mortar"
            );
            const targets = defenseBuildings.length > 0 ? defenseBuildings : aliveBuildings;
            for (const b of targets) {
              const d = dist(u.r, u.c, b.r, b.c);
              if (d < nearDist) { nearDist = d; nearest = b; }
            }
          } else {
            for (const b of aliveBuildings) {
              const d = dist(u.r, u.c, b.r, b.c);
              if (d < nearDist) { nearDist = d; nearest = b; }
            }
          }

          if (!nearest) continue;

          if (nearDist <= u.range) {
            // In attack range
            u.moveCooldown = 0;
            if (u.attackCooldown <= 0) {
              nearest.hp -= u.damage;
              u.attackCooldown = u.attackRate;

              // Splash damage
              if (u.splash > 0) {
                for (const b of newBuildings) {
                  if (b.hp <= 0 || b.id === nearest.id) continue;
                  const d = dist(b.r, b.c, nearest.r, nearest.c);
                  if (d <= u.splash) {
                    const splashDmg = Math.round(u.damage * 0.5);
                    b.hp -= splashDmg;
                    newEffects.push({
                      id: Math.random(), r: b.r, c: b.c,
                      text: `-${splashDmg}`, ttl: 3, color: "#ff6644",
                    });
                  }
                }
              }

              newProj.push({
                id: Math.random(),
                fromR: u.r, fromC: u.c, toR: nearest.r, toC: nearest.c,
                ttl: 3, maxTtl: 3,
                emoji: u.range > 2 ? "✨" : "⚔️",
              });
              newEffects.push({
                id: Math.random(), r: nearest.r, c: nearest.c,
                text: `-${u.damage}`, ttl: 4, color: "#ff4444",
              });
            } else {
              u.attackCooldown--;
            }
          } else {
            // Move towards target
            u.attackCooldown = Math.max(0, u.attackCooldown - 1);
            if (u.moveCooldown <= 0) {
              const blockers = new Set<string>();
              for (const ou of newUnits) {
                if (ou.id !== u.id && ou.hp > 0) blockers.add(`${ou.r},${ou.c}`);
              }
              for (const w of wallPositions) {
                if (nearest.type !== "wall" || `${nearest.r},${nearest.c}` !== w) {
                  blockers.add(w);
                }
              }

              const path = findPath(u.r, u.c, nearest.r, nearest.c, blockers);
              if (path.length > 0) {
                const [nr, nc] = path[0];
                // Ranged units stop when close enough
                if (u.range > 2) {
                  const newDist = dist(nr, nc, nearest.r, nearest.c);
                  if (newDist > u.range) {
                    const occupied = newUnits.some(ou => ou.id !== u.id && ou.hp > 0 && ou.r === nr && ou.c === nc);
                    if (!occupied) { u.r = nr; u.c = nc; }
                  }
                } else {
                  const occupied = newUnits.some(ou => ou.id !== u.id && ou.hp > 0 && ou.r === nr && ou.c === nc);
                  if (!occupied) { u.r = nr; u.c = nc; }
                }
              }
              const moveIntervalTicks = Math.max(1, Math.round(1 / u.speed));
              u.moveCooldown = moveIntervalTicks * 2 - 1;
            } else {
              u.moveCooldown--;
            }
          }
        }

        // --- Defense AI ---
        for (const b of newBuildings) {
          if (b.hp <= 0) continue;
          const bDef = BUILDING_DEFS[b.type];
          if (!bDef.range || !bDef.damage) continue;

          if (b.fireCooldown > 0) {
            b.fireCooldown--;
            continue;
          }

          let target: Unit | null = null;
          let tDist = Infinity;
          for (const u of newUnits) {
            if (u.hp <= 0) continue;
            const d = dist(b.r, b.c, u.r, u.c);
            if (bDef.minRange && d < bDef.minRange) continue;
            if (d <= bDef.range && d < tDist) {
              tDist = d;
              target = u;
            }
          }

          if (target) {
            target.hp -= bDef.damage;
            b.fireCooldown = bDef.fireRate??0;

            // Splash damage
            if (bDef.splash) {
              for (const u of newUnits) {
                if (u.hp <= 0 || u.id === target.id) continue;
                const d = dist(u.r, u.c, target.r, target.c);
                if (d <= bDef.splash) {
                  const splashDmg = Math.round(bDef.damage * 0.5);
                  u.hp -= splashDmg;
                  newEffects.push({
                    id: Math.random(), r: u.r, c: u.c,
                    text: `-${splashDmg}`, ttl: 3, color: "#ffaa44",
                  });
                }
              }
            }

            const projEmoji = b.type === "archer" ? "🏹" : b.type === "wizard" ? "🔮" : b.type === "mortar" ? "💣" : "💥";
            newProj.push({
              id: Math.random(),
              fromR: b.r, fromC: b.c, toR: target.r, toC: target.c,
              ttl: 3, maxTtl: 3, emoji: projEmoji,
            });
            newEffects.push({
              id: Math.random(), r: target.r, c: target.c,
              text: `-${bDef.damage}`, ttl: 4, color: "#ffaa00",
            });
          }
        }

        // Cleanup
        newUnits = newUnits.filter(u => u.hp > 0);
        newProj = newProj.filter(p => p.ttl > 0).map(p => ({ ...p, ttl: p.ttl - 1 }));

        const remainHp = newBuildings.filter(b => b.hp > 0).reduce((s, b) => s + b.hp, 0);
        const destr = totalHpRef.current > 0
          ? Math.round(((totalHpRef.current - remainHp) / totalHpRef.current) * 100)
          : 0;

        const allDestroyed = newBuildings.every(b => b.hp <= 0);
        const allUnitsDead = newUnits.length === 0;
        let nextPhase: Phase = prev.phase;
        if (allDestroyed || allUnitsDead) nextPhase = "result";

        return {
          ...prev,
          phase: nextPhase,
          buildings: newBuildings,
          units: newUnits,
          projectiles: newProj,
          effects: newEffects,
          destruction: destr,
          tick: prev.tick + 1,
        };
      });
    }, tickMs);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState.phase, gameState.battleSpeed]);

  // === Render ===
  const { phase, buildings, units, projectiles, effects, destruction, gold, elixir, battleSpeed } = gameState;

  const grid: { r: number; c: number }[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      grid.push({ r, c });
    }
  }

  return (
    <div className="game-container">
      <div className="game-title">⚔️ CLASH BUILDER ⚔️</div>

      {/* Status Bar */}
      <div className="status-bar">
        <span className={`phase-badge phase-${phase}`}>
          {phase === "defense" ? "🛡️ 防衛配置" : phase === "attack" ? "⚔️ 攻撃配置" : phase === "battle" ? "💥 戦闘中" : "🏆 結果"}
        </span>
        <div className="destruction-bar">
          <span className="destruction-label">破壊率</span>
          <div className="destruction-track">
            <div
              className="destruction-fill"
              style={{
                width: `${destruction}%`,
                background: destruction >= 100 ? "#f72585" : destruction >= 50 ? "#f77f00" : "#4cc9f0",
              }}
            />
          </div>
          <span className="destruction-text" style={{
            color: destruction >= 100 ? "#f72585" : "#4cc9f0",
          }}>{destruction}%</span>
        </div>
        {phase === "defense" && <span className="resource gold">💰 {gold}</span>}
        {phase === "attack" && <span className="resource elixir">💧 {elixir}</span>}
      </div>

      {/* Controls */}
      <div className="controls-bar">
        {phase === "defense" && Object.entries(BUILDING_DEFS)
          .filter(([key]) => key !== "base")
          .map(([key, b]) => (
            <button
              key={key}
              onClick={() => setSelectedBuilding(key as BuildingType)}
              className={`select-btn ${selectedBuilding === key ? "selected-defense" : ""}`}
              title={b.desc}
            >
              <span>{b.emoji} {b.name}</span>
              <span className="cost-label">💰{b.cost}</span>
            </button>
          ))}

        {phase === "attack" && Object.entries(UNIT_DEFS).map(([key, u]) => (
          <button
            key={key}
            onClick={() => setSelectedUnit(key as UnitType)}
            className={`select-btn ${selectedUnit === key ? "selected-attack" : ""}`}
            title={u.desc}
          >
            <span>{u.emoji} {u.name}</span>
            <span className="cost-label">💧{u.cost}</span>
          </button>
        ))}

        {phase === "defense" && (
          <>
            <button onClick={() => setGameState(p => ({ ...p, phase: "attack" }))} className="action-btn attack-btn">
              攻撃フェーズへ →
            </button>
            <button onClick={initDefense} className="action-btn reset-btn">🔄 リセット</button>
          </>
        )}

        {phase === "attack" && (
          <>
            <button
              onClick={startBattle}
              disabled={units.length === 0}
              className="action-btn battle-btn"
              style={{ opacity: units.length > 0 ? 1 : 0.5, cursor: units.length > 0 ? "pointer" : "not-allowed" }}
            >
              ⚔️ 戦闘開始！
            </button>
            <button
              onClick={() => setGameState(p => ({ ...p, phase: "defense", units: [], elixir: ATTACK_ELIXIR }))}
              className="action-btn reset-btn"
            >
              ← 防衛に戻る
            </button>
          </>
        )}

        {phase === "battle" && (
          <div className="speed-controls">
            {([1, 2, 3] as const).map(s => (
              <button
                key={s}
                onClick={() => setGameState(p => ({ ...p, battleSpeed: s }))}
                className={`speed-btn ${battleSpeed === s ? "speed-active" : ""}`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}

        {phase === "result" && (
          <button onClick={initDefense} className="action-btn result-btn">🔄 もう一度プレイ</button>
        )}
      </div>

      {/* Help / Info */}
      {phase === "defense" && (
        <>
          <div className="help-text">クリックで施設配置（もう一度クリックで撤去・返金） | 本拠地は移動不可</div>
          <div className="info-text">
            {BUILDING_DEFS[selectedBuilding].emoji} {BUILDING_DEFS[selectedBuilding].name}:
            HP{BUILDING_DEFS[selectedBuilding].hp}
            {BUILDING_DEFS[selectedBuilding].range ? ` | 射程${BUILDING_DEFS[selectedBuilding].range} | ATK${BUILDING_DEFS[selectedBuilding].damage}` : ""}
            {BUILDING_DEFS[selectedBuilding].splash ? " | 範囲" : ""}
            {BUILDING_DEFS[selectedBuilding].minRange ? ` | 死角${BUILDING_DEFS[selectedBuilding].minRange}` : ""}
            {" — "}{BUILDING_DEFS[selectedBuilding].desc}
          </div>
        </>
      )}
      {phase === "attack" && (
        <>
          <div className="help-text">外周2マスにユニットを配置（クリックで撤去・返金）</div>
          <div className="info-text">
            {UNIT_DEFS[selectedUnit].emoji} {UNIT_DEFS[selectedUnit].name}:
            HP{UNIT_DEFS[selectedUnit].hp} | ATK{UNIT_DEFS[selectedUnit].damage} | 射程{UNIT_DEFS[selectedUnit].range}
            {UNIT_DEFS[selectedUnit].splash ? " | 範囲" : ""}
            {UNIT_DEFS[selectedUnit].targetPriority ? " | 防衛優先" : ""}
            {" — "}{UNIT_DEFS[selectedUnit].desc}
          </div>
        </>
      )}

      {/* Grid */}
      <div className="game-grid" style={{ width: GRID_SIZE * CELL_SIZE, height: GRID_SIZE * CELL_SIZE }}>
        {grid.map(({ r, c }) => {
          const bld = buildings.find(x => x.r === r && x.c === c && x.hp > 0);
          const unt = units.find(x => x.r === r && x.c === c && x.hp > 0);
          const deadB = buildings.find(x => x.r === r && x.c === c && x.hp <= 0);
          const attackingHere = projectiles.some(
            p => (p.toR === r && p.toC === c) || (p.fromR === r && p.fromC === c)
          );
          const edge = isEdgeArea(r, c);
          const canPlace = phase === "attack" && edge;
          const clickable = phase === "defense" || canPlace;

          return (
            <div
              key={`${r}-${c}`}
              onClick={() => handleCellClick(r, c)}
              className={`cell ${clickable ? "cell-clickable" : ""}`}
              style={{
                left: c * CELL_SIZE,
                top: r * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
                background: edge
                  ? (phase === "attack" ? "rgba(230,57,70,0.15)" : "rgba(26,42,26,0.25)")
                  : (r + c) % 2 === 0 ? "rgba(45,106,79,0.13)" : "rgba(45,106,79,0.07)",
                boxShadow: attackingHere ? "inset 0 0 12px rgba(255,183,3,0.6)" : "none",
              }}
            >
              {deadB && <span style={{ fontSize: "14px", opacity: 0.3 }}>💨</span>}
              {bld && (
                <div className="entity">
                  <span className="entity-emoji">{BUILDING_DEFS[bld.type].emoji}</span>
                  <div className="hp-bar">
                    <div className="hp-fill" style={{
                      width: `${(bld.hp / bld.maxHp) * 100}%`,
                      background: bld.hp / bld.maxHp > 0.5 ? "#4cc9f0" : bld.hp / bld.maxHp > 0.25 ? "#f77f00" : "#e63946",
                    }} />
                  </div>
                </div>
              )}
              {unt && (
                <div className="entity">
                  <span className="unit-emoji">{UNIT_DEFS[unt.type].emoji}</span>
                  <div className="hp-bar hp-bar-unit">
                    <div className="hp-fill" style={{
                      width: `${(unt.hp / unt.maxHp) * 100}%`,
                      background: "#e63946",
                    }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {projectiles.map(p => {
          const progress = Math.min(1, (p.maxTtl - p.ttl + 1) / p.maxTtl);
          const x = (p.fromC + (p.toC - p.fromC) * progress) * CELL_SIZE + CELL_SIZE / 2 - 8;
          const y = (p.fromR + (p.toR - p.fromR) * progress) * CELL_SIZE + CELL_SIZE / 2 - 8;
          return (
            <div key={p.id} className="battle-projectile" style={{ left: x, top: y }}>
              {p.emoji}
            </div>
          );
        })}

        {effects.map(e => (
          <div key={e.id} className="battle-effect" style={{
            left: e.c * CELL_SIZE + CELL_SIZE / 2 - 12,
            top: e.r * CELL_SIZE - 4 + (4 - e.ttl) * -4,
            color: e.color,
            opacity: e.ttl / 4,
          }}>
            {e.text}
          </div>
        ))}
      </div>

      {/* Result */}
      {phase === "result" && (
        <div className={`result-panel ${destruction >= 100 ? "result-win" : "result-loss"}`}>
          <div className="result-stars">
            {destruction >= 100 ? "⭐⭐⭐" : destruction >= 50 ? "⭐⭐" : destruction > 0 ? "⭐" : "💀"}
          </div>
          <div className="result-title">
            {destruction >= 100 ? "完全勝利！" : destruction >= 50 ? "勝利！" : destruction > 0 ? "惜しい..." : "敗北..."}
          </div>
          <div className="result-detail">破壊率: {destruction}%</div>
        </div>
      )}

      {/* Unit Counts */}
      {(phase === "attack" || phase === "battle") && (
        <div className="unit-counts">
          {Object.entries(UNIT_DEFS).map(([key, def]) => {
            const count = units.filter(u => u.type === key && u.hp > 0).length;
            return count > 0 ? <span key={key}>{def.emoji} {def.name}: {count}</span> : null;
          })}
          <span>🏰 残存施設: {buildings.filter(b => b.hp > 0).length}</span>
        </div>
      )}
    </div>
  );
}

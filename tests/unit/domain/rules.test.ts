import { describe, expect, it } from "vitest";
import {
  byId,
  currentVersion,
  facts,
  mergeApiRobots,
  nextComponentId,
  robotById,
  saveParts,
  usedIn,
  usedQty,
} from "@/domain/rules";
import { CAT } from "@/shared/data/catalog";
import { ROBOTS } from "@/shared/data/robots";
import type { RobotApi } from "@/infrastructure/contracts/api";

const robot = ROBOTS[0];

describe("catalog and robot lookups", () => {
  it("finds a component and a robot by id, undefined when missing", () => {
    expect(byId(CAT, CAT[0].id)).toBe(CAT[0]);
    expect(byId(CAT, "zzz")).toBeUndefined();
    expect(robotById(ROBOTS, robot.id)).toBe(robot);
    expect(robotById(ROBOTS, "nope")).toBeUndefined();
  });

  it("currentVersion is the last version of the robot", () => {
    expect(currentVersion(robot)).toBe(robot.versions[robot.versions.length - 1]);
  });
});

describe("nextComponentId", () => {
  it("returns the highest numeric id plus one with zero padding", () => {
    expect(nextComponentId([{ id: "c02" }, { id: "c09" }] as never)).toBe("c10");
  });
  it("starts at c01 for an empty catalog and ignores non numeric ids", () => {
    expect(nextComponentId([])).toBe("c01");
    expect(nextComponentId([{ id: "custom" }] as never)).toBe("c01");
  });
});

describe("usage of components in robots", () => {
  it("usedIn lists the robots whose current version uses the component", () => {
    const partId = Object.values(currentVersion(robot).parts)[0]!.id;
    expect(usedIn(ROBOTS, partId).some((x) => x.r.id === robot.id)).toBe(true);
    expect(usedIn(ROBOTS, "zzz")).toEqual([]);
  });
  it("usedQty adds the quantities of every robot using it", () => {
    const motor = currentVersion(robot).parts.motor!;
    expect(usedQty(ROBOTS, motor.id)).toBeGreaterThanOrEqual(motor.qty);
    expect(usedQty(ROBOTS, "zzz")).toBe(0);
  });
});

describe("facts (derived data of a version)", () => {
  it("adds cost and mass of every part", () => {
    const f = facts(currentVersion(robot).parts, CAT);
    expect(f.cost).toBeGreaterThan(0);
    expect(f.mass).toBeGreaterThan(0);
    expect(f.motors).toBe(currentVersion(robot).parts.motor!.qty);
  });
  it("is zero for a version without parts", () => {
    const f = facts({}, CAT);
    expect(f.cost).toBe(0);
    expect(f.mass).toBe(0);
    expect(f.motors).toBe(0);
  });
});

describe("saveParts (builder, HU-06)", () => {
  it("completes the first version when the robot has no parts yet", () => {
    const empty = {
      ...robot,
      versions: [{ v: "v1", date: "hoy", note: "", status: "draft", parts: {} }],
    };
    const { robot: saved, version } = saveParts(
      empty as never,
      { mcu: { id: "c01", qty: 1 } },
      "n",
    );
    expect(saved.versions).toHaveLength(1);
    expect(version.parts.mcu).toEqual({ id: "c01", qty: 1 });
    expect(version.note).toBe("n");
  });

  it("creates the next version and demotes the current one to previous", () => {
    const { robot: saved, version } = saveParts(robot, { mcu: { id: "c01", qty: 1 } }, "nueva");
    const before = robot.versions.length;
    expect(saved.versions).toHaveLength(before + 1);
    expect(version.v).toBe("v" + (parseInt(currentVersion(robot).v.slice(1), 10) + 1));
    expect(saved.versions[before - 1].status).toBe("previous");
  });

  it("does not mutate the original robot", () => {
    const snapshot = JSON.stringify(robot);
    saveParts(robot, {}, "x");
    expect(JSON.stringify(robot)).toBe(snapshot);
  });
});

describe("mergeApiRobots", () => {
  const summary = (over: Partial<RobotApi>): RobotApi =>
    ({ id: robot.id, type: "minisumo", firmware: "9.9", ...over }) as RobotApi;

  it("takes type and firmware from the API and keeps local versions", () => {
    const [merged] = mergeApiRobots([robot], [summary({})]);
    expect(merged.type).toBe("minisumo");
    expect(merged.fw).toBe("9.9");
    expect(merged.versions).toBe(robot.versions);
  });
  it("keeps the local robot when the API does not know it", () => {
    expect(mergeApiRobots([robot], [summary({ id: "other" })])[0]).toBe(robot);
  });
});

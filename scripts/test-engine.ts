/** Engine smoke test — validates algorithms against the real data assets. */
import { buildGeneratedPath, loadEngineData, computeDepths, skillSearch } from "../src/lib/engine/index";
import { computeRadar } from "../src/lib/engine/radar";

async function main() {
  const { graph, catalogue, resources } = await loadEngineData();
  console.log(`Loaded: ${Object.keys(graph.skills).length} skills, ${catalogue.courses.length} courses, ${resources.resources.length} resources`);

  const depths = computeDepths(graph);
  console.log("Sample depths:", Object.entries(depths).filter(([id]) => id.startsWith("ds_")).slice(0, 5));

  // Standard path to Deep Learning with Python known
  const target = "ds_datascience";
  const std = await buildGeneratedPath({ targetSkillId: target, knownSkillIds: ["ds_python", "ds_excel"], algorithm: "dfs-topological" });
  console.log(`\nStandard path to ${target}: ${std.skills.length} skills, ${std.totalEstimatedHours}h total`);
  console.log("order:", std.skills.map((s) => s.skillName).join(" → "));

  const opt = await buildGeneratedPath({ targetSkillId: target, knownSkillIds: ["ds_python", "ds_excel"], algorithm: "kahn-spt" });
  console.log(`\nOptimal (SPT) path: ${opt.skills.length} skills`);
  console.log("order:", opt.skills.map((s) => s.skillName).join(" → "));

  // Verify topological validity of both
  for (const [name, path] of [["std", std], ["opt", opt]] as const) {
    const pos = new Map(path.skills.map((s, i) => [s.skillId, i]));
    let valid = true;
    for (const skill of path.skills) {
      const node = graph.skills[skill.skillId];
      for (const p of node.prereqs) {
        if (pos.has(p) && pos.get(p)! > pos.get(skill.skillId)!) {
          valid = false;
          console.log(`  VIOLATION in ${name}: ${p} after ${skill.skillId}`);
        }
      }
    }
    console.log(`${name} topological validity: ${valid ? "PASS" : "FAIL"}`);
  }

  // Radar
  const radar = computeRadar(
    graph,
    [
      { skillId: "ds_python", claimedLevel: 4, evidencedLevel: 4 },
      { skillId: "ds_stats", claimedLevel: 5, evidencedLevel: 2 },
    ],
    target,
    depths,
  );
  console.log("\nRadar axes:", JSON.stringify(radar.axes, null, 1));
  console.log("Overclaim points:", radar.points.filter((p) => p.overclaim > 0).map((p) => `${p.skillName} (+${p.overclaim})`));

  // Search
  const hits = await skillSearch("machine learning");
  console.log("\nSearch 'machine learning':", hits.slice(0, 5).map((h) => h.name));

  console.log("\nALL ENGINE TESTS DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
